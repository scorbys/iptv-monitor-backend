import os
import re
import pickle
import numpy as np
import pandas as pd
from imblearn.ensemble import BalancedRandomForestClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
from scipy import sparse
from imblearn.over_sampling import SMOTE
from collections import Counter
from typing import Tuple, Dict, Any, Optional
import joblib

from .preprocessing import TextPreprocessor
from app.config import config

class MLModelService:
    def __init__(self):
        self.preprocessor = TextPreprocessor()
        self.model: Optional[BalancedRandomForestClassifier] = None
        self.tfidf: Optional[TfidfVectorizer] = None
        self.label_encoder: Optional[LabelEncoder] = None
        self.fix_mapping: Dict[str, Any] = {}
        self.is_trained = False
        self.accuracy: Optional[float] = None  # Test set accuracy (persisted)
        self.per_class_accuracy: Optional[Dict[str, float]] = None  # Per-class recall (accuracy)

    def load_artifacts(self) -> bool:
        """Load saved model artifacts"""
        try:
            model_path = os.path.join(config.ARTIFACTS_DIR, config.MODEL_NAME)
            tfidf_path = os.path.join(config.ARTIFACTS_DIR, config.TFIDF_NAME)
            le_path = os.path.join(config.ARTIFACTS_DIR, config.LABEL_ENCODER_NAME)
            fix_mapping_path = os.path.join(config.ARTIFACTS_DIR, "fix_mapping.pkl")

            if not all(os.path.exists(p) for p in [model_path, tfidf_path, le_path]):
                return False

            self.model = joblib.load(model_path)
            self.tfidf = joblib.load(tfidf_path)
            self.label_encoder = joblib.load(le_path)

            # Load fix mapping if exists
            if os.path.exists(fix_mapping_path):
                with open(fix_mapping_path, 'rb') as f:
                    self.fix_mapping = pickle.load(f)

            # Load persisted test accuracy if exists
            accuracy_path = os.path.join(config.ARTIFACTS_DIR, "accuracy.pkl")
            if os.path.exists(accuracy_path):
                with open(accuracy_path, 'rb') as f:
                    self.accuracy = pickle.load(f)

            # Load per-class accuracy if exists
            per_class_path = os.path.join(config.ARTIFACTS_DIR, "per_class_accuracy.pkl")
            if os.path.exists(per_class_path):
                with open(per_class_path, 'rb') as f:
                    self.per_class_accuracy = pickle.load(f)

            self.is_trained = True
            return True
        except Exception as e:
            print(f"Error loading artifacts: {e}")
            return False

    def save_artifacts(self):
        """Save model artifacts"""
        os.makedirs(config.ARTIFACTS_DIR, exist_ok=True)

        joblib.dump(self.model, os.path.join(config.ARTIFACTS_DIR, config.MODEL_NAME), compress=3)
        joblib.dump(self.tfidf, os.path.join(config.ARTIFACTS_DIR, config.TFIDF_NAME), compress=3)
        joblib.dump(self.label_encoder, os.path.join(config.ARTIFACTS_DIR, config.LABEL_ENCODER_NAME), compress=3)

        # Save stopwords
        with open(os.path.join(config.ARTIFACTS_DIR, config.STOPWORDS_NAME), 'wb') as f:
            pickle.dump(list(self.preprocessor.stopwords), f)

        # Save fix mapping
        with open(os.path.join(config.ARTIFACTS_DIR, "fix_mapping.pkl"), 'wb') as f:
            pickle.dump(self.fix_mapping, f)

        # Save test accuracy
        if self.accuracy is not None:
            with open(os.path.join(config.ARTIFACTS_DIR, "accuracy.pkl"), 'wb') as f:
                pickle.dump(self.accuracy, f)

        # Save per-class accuracy
        if self.per_class_accuracy is not None:
            with open(os.path.join(config.ARTIFACTS_DIR, "per_class_accuracy.pkl"), 'wb') as f:
                pickle.dump(self.per_class_accuracy, f)

    def train_from_excel(self, file_path: str, sheet_name: str = "Sheet1") -> Dict[str, Any]:
        """Train model from Excel file"""
        try:
            # Validate file exists and is readable
            if not os.path.exists(file_path):
                raise ValueError(f"File not found: {file_path}")

            if not os.access(file_path, os.R_OK):
                raise ValueError(f"File not readable: {file_path}")

            # Validate sheet_name
            if not isinstance(sheet_name, str) or len(sheet_name.strip()) == 0:
                raise ValueError("Invalid sheet name")

            df = pd.read_excel(file_path, sheet_name=sheet_name)
            return self.train_from_dataframe(df)
        except pd.errors.EmptyDataError:
            raise ValueError("Excel file is empty")
        except pd.errors.ParserError:
            raise ValueError("Invalid Excel file format")
        except ValueError as e:
            if "Worksheet" in str(e) or "sheet" in str(e).lower():
                raise ValueError(f"Sheet '{sheet_name}' not found in Excel file")
            raise
        except Exception as e:
            raise Exception(f"Error reading Excel file: {e}")

    def train_from_dataframe(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Train model from DataFrame"""
        try:
            # Find comment and label columns
            comment_col = self._find_comment_column(df)
            label_col = self._find_label_column(df)

            if comment_col is None or label_col is None:
                raise ValueError("Could not find comment or label columns")

            # Clean data
            df = df.dropna(subset=[label_col]).copy()
            df[label_col] = df[label_col].astype(str).str.strip()
            df[comment_col] = df[comment_col].fillna("").astype(str)

            # Group rare labels
            class_counts = Counter(df[label_col])
            rare_labels = [k for k, v in class_counts.items() if v < 2]
            df["label_group"] = df[label_col].apply(lambda x: "Other" if x in rare_labels else x)

            # Encode labels
            self.label_encoder = LabelEncoder()
            y = self.label_encoder.fit_transform(df["label_group"])

            print(f"Classes after encoding: {list(self.label_encoder.classes_)}")
            print(f"Class distribution: {np.bincount(y)}")

            # Preprocess text
            df["comment_clean"] = df[comment_col].apply(self.preprocessor.preprocess)

            # Debug logging
            print(f"Data shape after cleaning: {df.shape}")
            print(f"Comment column: {comment_col}, Label column: {label_col}")
            print(f"Sample comment_clean: {df['comment_clean'].head(3).tolist()}")
            print(f"Unique labels: {df[label_col].unique()[:5]}")  # First 5 unique labels

            # Extract numeric features
            df["text_len"] = df[comment_col].apply(len)
            df["word_count"] = df["comment_clean"].apply(
                lambda s: len(s.split()) if isinstance(s, str) and s.strip() else 0
            )

            # Split data
            min_count = min(np.bincount(y))
            stratify = y if min_count >= 2 else None

            train_idx, test_idx = train_test_split(
                df.index, test_size=config.TRAIN_TEST_SPLIT, random_state=config.RANDOM_STATE, stratify=stratify
            )

            X_train_text = df.loc[train_idx, "comment_clean"].astype(str)
            X_test_text = df.loc[test_idx, "comment_clean"].astype(str)
            y_train = y[df.index.get_indexer(train_idx)]
            y_test = y[df.index.get_indexer(test_idx)]

            # TF-IDF Vectorization
            # Keep feature dimensionality lower for memory-constrained deployments.
            self.tfidf = TfidfVectorizer(
                max_features=config.MAX_FEATURES,
                ngram_range=config.NGRAM_RANGE,
                sublinear_tf=True,
                min_df=3
            )

            X_train_tfidf = self.tfidf.fit_transform(X_train_text)
            X_test_tfidf = self.tfidf.transform(X_test_text)

            print(f"TF-IDF vocabulary size: {len(self.tfidf.vocabulary_)}")
            print(f"Sample TF-IDF features: {list(self.tfidf.get_feature_names_out()[:10])}")

            # Debug exports
            # df.loc[train_idx].to_csv(os.path.join(config.ARTIFACTS_DIR, "debug_train_data.csv"), index=False)
            # df.loc[test_idx].to_csv(os.path.join(config.ARTIFACTS_DIR, "debug_test_data.csv"), index=False)
            # with open(os.path.join(config.ARTIFACTS_DIR, "debug_tfidf_features.txt"), "w", encoding="utf-8") as f:
            #     f.write("\n".join(self.tfidf.get_feature_names_out()))

            # Numeric features
            X_train_num = sparse.csr_matrix(df.loc[train_idx, ["text_len", "word_count"]].values)
            X_test_num = sparse.csr_matrix(df.loc[test_idx, ["text_len", "word_count"]].values)

            # Combine features
            X_train = sparse.hstack([X_train_tfidf, X_train_num])
            X_test = sparse.hstack([X_test_tfidf, X_test_num])

            # Apply SMOTE conditionally based on config
            if config.SMOTE_ENABLED:
                smote = SMOTE(random_state=config.RANDOM_STATE)
                X_train_res, y_train_res = smote.fit_resample(X_train, y_train)
                print("SMOTE applied to training data.")
            else:
                X_train_res, y_train_res = X_train, y_train
                print("SMOTE not applied (matching Colab behavior).")

            # Train model
            self.model = BalancedRandomForestClassifier(
                n_estimators=200,
                max_depth=None,
                max_features="sqrt",
                min_samples_split=4, # reduce overfiting
                min_samples_leaf=2,
                bootstrap=True,
                sampling_strategy="all",
                random_state=config.RANDOM_STATE,
                n_jobs=1,
                replacement=False,
                oob_score=True
            )

            self.model.fit(X_train_res, y_train_res)

            # Evaluate - BalancedRandomForest can handle sparse arrays directly
            y_pred = self.model.predict(X_test)
            accuracy = accuracy_score(y_test, y_pred)

            # Debug logging
            print(f"Training completed. Accuracy: {accuracy:.4f}")
            print(f"Number of features: {X_train.shape[1]}")
            print(f"Training samples: {X_train_res.shape[0]}, Test samples: {X_test.shape[0]}")
            print(f"SMOTE enabled: {config.SMOTE_ENABLED}")

            # Classification report
            unique_labels = np.unique(y_test)
            report = classification_report(
                y_test, y_pred,
                labels=unique_labels,
                target_names=self.label_encoder.inverse_transform(unique_labels),
                zero_division=0,
                output_dict=True
            )

            # Per-class accuracy = recall per class (what fraction of true positives were caught)
            # This matches the notebook's "AKURASI PER KATEGORI" which uses recall
            self.per_class_accuracy = {
                label: float(report[label]["recall"])
                for label in self.label_encoder.inverse_transform(unique_labels)
                if label in report
            }

            self.is_trained = True
            self.accuracy = float(accuracy)  # Persist test accuracy
            self._generate_fix_mapping(df, label_col)

            # Simpan nilai yang dibutuhkan SEBELUM del
            n_features = X_train.shape[1]
            train_samples = X_train_res.shape[0]
            test_samples = X_test.shape[0]

            # Save artifacts
            self.save_artifacts()

            # Bebaskan memori training setelah selesai
            import gc
            del X_train, X_test, X_train_tfidf, X_test_tfidf
            del X_train_num, X_test_num, X_train_res, y_train_res
            gc.collect()

            return {
                "accuracy": accuracy,
                "oob_score": float(self.model.oob_score_) if hasattr(self.model, "oob_score_") else None,
                "classification_report": report,
                "n_classes": len(self.label_encoder.classes_),
                "classes": list(self.label_encoder.classes_),
                "n_features": n_features,
                "train_samples": train_samples,  # Use shape[0] for sparse arrays
                "test_samples": test_samples,  # Use shape[0] for consistency
                "debug_info": {
                    "vocab_size": len(self.tfidf.vocabulary_),
                    "sample_features": list(self.tfidf.get_feature_names_out()[:20]),
                    "sample_train_comments": df.loc[train_idx, "comment_clean"].head(5).tolist(),
                    "data_shape": df.shape,
                    "train_test_split": len(train_idx) / len(df)
                }
            }

        except Exception as e:
            raise Exception(f"Error training model: {e}")

    def _is_kategori(self, label) -> bool:
        return bool(re.match(r'^Kat[ae]gori-\d+$', str(label), re.IGNORECASE))

    def _coerce_to_kategori(self, label, probs):
        """Never output 'External'/non-numbered: remap to the highest-probability
        Kategori class so every prediction maps to a concrete error category."""
        if self._is_kategori(label) or probs is None:
            return label
        for i in np.argsort(probs)[::-1]:
            cand = self.label_encoder.inverse_transform([int(i)])[0]
            if self._is_kategori(cand):
                return cand
        return label

    def predict(self, text: str) -> Dict[str, Any]:
        """Make prediction on single text"""
        if not self.is_trained:
            raise Exception("Model is not trained yet")

        try:
            # Preprocess
            cleaned_text = self.preprocessor.preprocess(text)

            # TF-IDF
            X_tfidf = self.tfidf.transform([cleaned_text])

            # Numeric features
            text_len, word_count = self.preprocessor.get_text_features(text, cleaned_text)
            X_num = sparse.csr_matrix([[text_len, word_count]])

            # Combine features
            X_input = sparse.hstack([X_tfidf, X_num]).toarray()

            # Predict
            pred_idx = self.model.predict(X_input)[0]
            label = self.label_encoder.inverse_transform([pred_idx])[0]

            # Probabilities (computed once, reused for the no-External remap)
            probs = self.model.predict_proba(X_input)[0] if hasattr(self.model, "predict_proba") else None

            # Keep the raw label (including "External" = infrastructure/network
            # issues) so it shows as a real category in Analytics/QoS/Notifications.

            probabilities = None
            if probs is not None:
                top_indices = np.argsort(probs)[::-1][:5]
                probabilities = [
                    {
                        "label": self.label_encoder.inverse_transform([i])[0],
                        "probability": float(probs[i])
                    }
                    for i in top_indices
                ]

            # Get recommended fix
            recommended_fix = self.get_recommended_fix(label, text)

            return {
                "text": text,
                "cleaned_text": cleaned_text,
                "predicted_label": label,
                "probabilities": probabilities,
                "features": {
                    "text_len": text_len,
                    "word_count": word_count
                },
                "recommended_fix": recommended_fix
            }

        except Exception as e:
            raise Exception(f"Error making prediction: {e}")

    def _find_comment_column(self, df: pd.DataFrame) -> Optional[str]:
        """Find comment column in DataFrame"""
        for col in df.columns:
            if isinstance(col, str) and any(keyword in col.lower() for keyword in ["comment", "update", "koment", "keterangan"]):
                return col
        return None

    def _find_label_column(self, df: pd.DataFrame) -> Optional[str]:
        """Find label column in DataFrame"""
        for col in df.columns:
            if isinstance(col, str) and any(keyword in col.lower() for keyword in ["kategori", "category", "class"]):
                return col
        return None

    def _generate_fix_mapping(self, df: pd.DataFrame, label_col: str):
        """Generate fix mapping from training data"""
        self.fix_mapping = {}

        # Find solution column if exists
        solution_col = self._find_solution_column(df)

        for category in self.label_encoder.classes_:
            category_data = df[df['label_group'] == category]

            if solution_col and not category_data.empty:
                # Find most common solution for this category
                solutions = category_data[solution_col].dropna()
                if not solutions.empty:
                    top_solution = solutions.mode()[0] if not solutions.mode().empty else solutions.iloc[0]

                    # Map to action
                    action = self._map_solution_to_action(top_solution, category)

                    self.fix_mapping[category] = {
                        "action": action["action"],
                        "command": action["command"],
                        "params": action["params"],
                        "description": top_solution,
                        "category": category
                    }
                    continue

            # Fallback to default mapping based on category
            self.fix_mapping[category] = self._get_default_fix_for_category(category)

    def _find_solution_column(self, df: pd.DataFrame) -> Optional[str]:
        """Find solution column in DataFrame"""
        for col in df.columns:
            if isinstance(col, str) and any(keyword in col.lower() for keyword in ["solusi", "solution", "fix", "action"]):
                return col
        return None

    def _map_solution_to_action(self, solution: str, category: str) -> Dict[str, Any]:
        """Map natural language solution to executable action"""
        solution_lower = solution.lower()

        # Chromecast fixes for Kategori-1 (No Device Found)
        if category == "Kategori-1":
            if "white list" in solution_lower and ("deactive" in solution_lower or "deactivate" in solution_lower):
                return {
                    "action": "deactivate_whitelist",
                    "command": "deactivate_whitelist_profile",
                    "params": {},
                    "description": solution
                }
            elif "restart" in solution_lower:
                return {
                    "action": "restart_device",
                    "command": "restart_chromecast",
                    "params": {},
                    "description": solution
                }

        # TV fixes for Kategori-2 (Weak/No Signal)
        if category == "Kategori-2":
            if "hdmi" in solution_lower and "check" in solution_lower:
                return {
                    "action": "check_hdmi",
                    "command": "check_hdmi_connection",
                    "params": {},
                    "description": solution
                }
            elif "lan" in solution_lower and "check" in solution_lower:
                return {
                    "action": "check_lan",
                    "command": "verify_lan_connection",
                    "params": {},
                    "description": solution
                }

        # Channel fixes for Kategori-5 (Error Playing)
        if category == "Kategori-5":
            if "stream" in solution_lower and ("reset" in solution_lower or "reload" in solution_lower):
                return {
                    "action": "reset_stream",
                    "command": "reset_channel_stream",
                    "params": {},
                    "description": solution
                }

        # Default: manual intervention
        return {
            "action": "manual",
            "command": None,
            "params": {},
            "description": solution + " (Manual intervention required)"
        }

    def _get_default_fix_for_category(self, category: str) -> Dict[str, Any]:
        """Get default fix mapping for a category"""
        # Dataset labels use the "Katagori-" spelling; the fix table (and the rest
        # of the app) use the canonical "Kategori-". Normalize so the lookup hits
        # the category-specific fix instead of falling back to manual.
        category = re.sub(r'^Katagori-', 'Kategori-', str(category), flags=re.IGNORECASE)
        default_fixes = {
            "Kategori-1": {
                "action": "deactivate_whitelist",
                "command": "deactivate_whitelist_profile",
                "params": {},
                "description": "Deactivate whitelist profile and restart Chromecast",
                "category": category
            },
            "Kategori-2": {
                "action": "check_lan",
                "command": "verify_lan_connection",
                "params": {},
                "description": "Check LAN connection and HDMI source",
                "category": category
            },
            "Kategori-3": {
                "action": "check_lan_cable",
                "command": "verify_lan_cable_connection",
                "params": {},
                "description": "Verify LAN cable connection (IN vs OUT port)",
                "category": category
            },
            "Kategori-4": {
                "action": "ios_setup_guide",
                "command": "guide_ios_setup",
                "params": {},
                "description": "Guide user through iOS Chromecast setup",
                "category": category
            },
            "Kategori-5": {
                "action": "reset_stream",
                "command": "reset_channel_stream",
                "params": {},
                "description": "Reset channel stream",
                "category": category
            },
            "Kategori-6": {
                "action": "reload_igmp",
                "command": "reload_igmp",
                "params": {},
                "description": "Reload IGMP for error player",
                "category": category
            },
            "Kategori-7": {
                "action": "check_ip_conflict",
                "command": "verify_ip_conflict",
                "params": {},
                "description": "Check for IP conflicts",
                "category": category
            },
            "Kategori-8": {
                "action": "reset_config",
                "command": "reset_chromecast_config",
                "params": {},
                "description": "Reset Chromecast configuration",
                "category": category
            },
            "Kategori-9": {
                "action": "check_network_access",
                "command": "verify_local_network_access",
                "params": {},
                "description": "Verify local network access permissions",
                "category": category
            },
            "Kategori-10": {
                "action": "check_power",
                "command": "check_power_adapter",
                "params": {},
                "description": "Check power adapter status",
                "category": category
            },
            "Kategori-11": {
                "action": "verify_channel_connection",
                "command": "verify_channel_lan_connection",
                "params": {},
                "description": "Verify LAN connection for channel",
                "category": category
            },
            "Kategori-12": {
                "action": "verify_provider_status",
                "command": "check_provider_connectivity",
                "params": {},
                "description": "Verify external provider status and network connectivity",
                "category": category
            },
            "Kategori-13": {
                "action": "reset_streaming_pipeline",
                "command": "reset_streaming_pipeline",
                "params": {},
                "description": "Restart the streaming pipeline and clear temporary session state",
                "category": category
            },
            "Kategori-14": {
                "action": "manual_review",
                "command": None,
                "params": {},
                "description": "Manual review required for this issue category",
                "category": category
            }
        }

        return default_fixes.get(category, {
            "action": "manual",
            "command": None,
            "params": {},
            "description": "Manual intervention required",
            "category": category
        })

    def get_recommended_fix(self, category: str, text: str = "") -> Optional[Dict[str, Any]]:
        """Get recommended fix for a predicted category"""
        if not self.is_trained:
            return None

        return self.fix_mapping.get(category)

    def get_model_info(self) -> Dict[str, Any]:
        """Get model information"""
        if not self.is_trained:
            return {"is_trained": False}

        return {
            "is_trained": True,
            "n_classes": len(self.label_encoder.classes_),
            "classes": list(self.label_encoder.classes_),
            "n_features": self.model.n_features_in_ if hasattr(self.model, "n_features_in_") else None,
            "oob_score": float(self.model.oob_score_) if hasattr(self.model, "oob_score_") else None,
            "accuracy": float(self.accuracy) if self.accuracy is not None else None,
            "per_class_accuracy": self.per_class_accuracy  # dict: {label: recall_float} or None
        }

# Global model service instance
ml_service = MLModelService()