from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any
import os
import sys
import json
import threading
import shutil
import logging
import asyncio
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

# Ensure the project root is on sys.path so `from app.config import config` works
# even when the script is started from a different working directory.
ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.config import config
from utils import ml_service

# Cache 30 seconds
_model_info_cache = {"data": None, "ts": 0, "ttl": 30}

# Thread pool for blocking operations
train_pool = ThreadPoolExecutor(max_workers=1)   # Training tetap 1 (resource-heavy)
predict_pool = ThreadPoolExecutor(max_workers=4)  # Predict bisa concurrent
thread_pool = ThreadPoolExecutor(max_workers=1)

# In-memory training job store
training_jobs: Dict[str, Dict[str, Any]] = {}
training_jobs_lock = threading.Lock()
training_jobs_file = os.path.join(config.DATA_DIR, "training_jobs.json")

# Configure logging
logging.basicConfig(level=config.LOG_LEVEL.upper())
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="IPTV ML Prediction Service",
    description="Machine Learning service for IPTV comment classification",
    version="1.0.0",
    root_path="/ml",
    docs_url="/docs",
    openapi_url="/openapi.json",
    redoc_url=None,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models
class PredictRequest(BaseModel):
    text: str

class PredictResponse(BaseModel):
    text: str
    cleaned_text: str
    predicted_label: str
    probabilities: Optional[list] = None
    features: dict

class ModelInfoResponse(BaseModel):
    is_trained: bool
    n_classes: Optional[int] = None
    classes: Optional[list] = None
    n_features: Optional[int] = None
    oob_score: Optional[float] = None
    accuracy: Optional[float] = None
    per_class_accuracy: Optional[dict] = None  # {label: recall_float}

class TrainResponse(BaseModel):
    success: bool
    message: str
    job_id: Optional[str] = None
    accuracy: Optional[float] = None
    oob_score: Optional[float] = None
    classification_report: Optional[dict] = None
    n_classes: Optional[int] = None
    classes: Optional[list] = None
    n_features: Optional[int] = None

# Startup event
@app.on_event("startup")
async def startup_event():
    """Load model artifacts on startup"""
    import os

    # Use config port (already handles Railway PORT correctly)
    port = config.ML_SERVICE_PORT
    logger.info(f"Starting ML service on port {port}...")
    logger.info(f"Environment PORT: {os.getenv('PORT', 'not set')}")
    logger.info(f"Using config port: {config.ML_SERVICE_PORT}")
    logger.info(f"Host: {config.ML_SERVICE_HOST}")
    logger.info(f"CORS origins: {config.CORS_ORIGINS}")
    logger.info(f"Artifacts directory: {config.ARTIFACTS_DIR}")
    logger.info(f"Data directory: {config.DATA_DIR}")

    os.makedirs(config.DATA_DIR, exist_ok=True)
    load_training_jobs()

    try:
        if ml_service.load_artifacts():
            logger.info("Model artifacts loaded successfully")
        else:
            logger.info("No pre-trained model found. Model needs to be trained.")
    except Exception as e:
        logger.error(f"Error loading artifacts: {e}")
        logger.info("Starting without pre-trained model")

    # Give server time to fully initialize
    logger.info("Server initialization complete, ready to accept connections...")
    await asyncio.sleep(2)  # Increased delay to ensure server is ready

# Health check
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "IPTV ML Prediction Service",
        "model_loaded": ml_service.is_trained,
        "ready": True
    }

# Get model info
@app.get("/api/model/info", response_model=ModelInfoResponse)
async def get_model_info():
    now = time.time()
    if _model_info_cache["data"] and (now - _model_info_cache["ts"]) < _model_info_cache["ttl"]:
        return _model_info_cache["data"]
    try:
        logger.info("Received request for model info")
        result = ml_service.get_model_info()
        _model_info_cache["data"] = result
        _model_info_cache["ts"] = now
        logger.info(f"Model info: {result}")
        return result
    except Exception as e:
        logger.error(f"Error getting model info: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

# Predict endpoint
@app.post("/api/predict", response_model=PredictResponse)
async def predict(request: PredictRequest):
    """Make prediction on text"""
    if not ml_service.is_trained:
        raise HTTPException(status_code=400, detail="Model is not trained yet")

    # Input validation
    if not request.text or len(request.text.strip()) == 0:
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    if len(request.text) > 10000:  # Max 10KB text
        raise HTTPException(status_code=400, detail="Text too long (max 10000 characters)")

    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            predict_pool, 
            ml_service.predict, 
            request.text
        )
        return result
    except Exception as e:
        logger.error(f"Prediction error: {e}")
        raise HTTPException(status_code=500, detail="Prediction failed")

def save_training_jobs() -> None:
    with training_jobs_lock:
        os.makedirs(config.DATA_DIR, exist_ok=True)
        try:
            with open(training_jobs_file, "w", encoding="utf-8") as f:
                json.dump(training_jobs, f, indent=2)
        except Exception as exc:
            logger.warning(f"Unable to save training jobs: {exc}")


def load_training_jobs() -> None:
    with training_jobs_lock:
        if not os.path.exists(training_jobs_file):
            return
        try:
            with open(training_jobs_file, "r", encoding="utf-8") as f:
                saved = json.load(f)
            if isinstance(saved, dict):
                changed = False
                for job_id, job in saved.items():
                    if job.get("status") in ["pending", "running"]:
                        job["status"] = "failed"
                        job["error"] = "Training interrupted by server restart"
                        job["completed_at"] = time.time()
                        changed = True
                training_jobs.clear()
                training_jobs.update(saved)
                if changed:
                    save_training_jobs()
        except Exception as exc:
            logger.warning(f"Unable to load training jobs: {exc}")


def _on_training_done(job_id: str, future):
    job = training_jobs.get(job_id)
    if job is None:
        return

    try:
        result = future.result()
        job["status"] = "completed"
        job["result"] = result
        job["error"] = None
        job["completed_at"] = time.time()
        _model_info_cache["data"] = None
        _model_info_cache["ts"] = 0
    except Exception as exc:
        job["status"] = "failed"
        job["result"] = None
        job["error"] = str(exc)
        job["completed_at"] = time.time()
    finally:
        save_training_jobs()

# Train model endpoint
@app.post("/api/model/train", response_model=TrainResponse)
async def train_model(file: UploadFile = File(...), sheet_name: str = "Sheet1"):
    """Start model training as a background job"""
    try:
        # Input validation
        if not file.filename.lower().endswith(('.xlsx', '.xls')):
            raise HTTPException(status_code=400, detail="Only Excel files (.xlsx, .xls) are allowed")

        if len(sheet_name.strip()) == 0:
            raise HTTPException(status_code=400, detail="Sheet name cannot be empty")

        if any(job["status"] in ["pending", "running"] for job in training_jobs.values()):
            raise HTTPException(status_code=409, detail="Another training job is already in progress")

        logger.info(f"Received training request - File: {file.filename}, Sheet: {sheet_name}")

        # Check file size (max 50MB)
        file_content = await file.read()
        if len(file_content) > 50 * 1024 * 1024:  # 50MB
            raise HTTPException(status_code=400, detail="File size exceeds 50MB limit")

        # Save uploaded file with secure filename
        os.makedirs(config.DATA_DIR, exist_ok=True)
        secure_filename = "".join(c for c in file.filename if c.isalnum() or c in "._-").strip()
        if not secure_filename:
            secure_filename = f"upload_{int(time.time())}.xlsx"
        file_path = os.path.join(config.DATA_DIR, secure_filename)

        logger.info(f"Saving file to: {file_path}")
        with open(file_path, "wb") as buffer:
            buffer.write(file_content)

        logger.info(f"Starting model training with file: {secure_filename}")

        job_id = str(uuid4())
        future = train_pool.submit(ml_service.train_from_excel, file_path, sheet_name)
        training_jobs[job_id] = {
            "status": "running",
            "created_at": time.time(),
            "completed_at": None,
            "result": None,
            "error": None,
        }
        save_training_jobs()
        future.add_done_callback(lambda fut, jid=job_id: _on_training_done(jid, fut))

        return TrainResponse(
            success=True,
            message="Training started",
            job_id=job_id
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Training error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Training failed: {str(e)}")

@app.get("/api/model/train/status/{job_id}")
async def get_training_status(job_id: str):
    job = training_jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Training job not found")

    return {
        "success": True,
        "data": {
            "job_id": job_id,
            "status": job["status"],
            "created_at": job["created_at"],
            "completed_at": job["completed_at"],
            "error": job["error"],
            "result": job["result"] if job["status"] == "completed" else None,
        }
    }

@app.get("/api/model/train/status")
async def get_current_training_status():
    active_jobs = [
        {
            "job_id": jid,
            "status": job["status"],
            "created_at": job["created_at"],
            "completed_at": job["completed_at"],
            "error": job["error"],
            "result": job["result"] if job["status"] == "completed" else None,
        }
        for jid, job in training_jobs.items()
        if job.get("status") in ["pending", "running"]
    ]

    if active_jobs:
        return {
            "success": True,
            "data": {
                "has_active_job": True,
                "active_job": active_jobs[0],
            }
        }

    return {
        "success": True,
        "data": {
            "has_active_job": False,
            "active_job": None,
        }
    }

# Delete model endpoint
@app.delete("/api/model")
async def delete_model():
    """Delete trained model"""
    try:
        import glob
        artifact_files = glob.glob(os.path.join(config.ARTIFACTS_DIR, "*.pkl"))

        for file in artifact_files:
            os.remove(file)

        ml_service.model = None
        ml_service.tfidf = None
        ml_service.label_encoder = None
        ml_service.is_trained = False
        _model_info_cache["data"] = None  # invalidate cache
        _model_info_cache["ts"] = 0

        return {"success": True, "message": "Model deleted successfully"}

    except Exception as e:
        logger.error(f"Delete model error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn

    reload_mode = os.getenv("UVICORN_RELOAD", "false").lower() in ["1", "true", "yes"]
    uvicorn.run(
        "app.main:app",
        host=config.ML_SERVICE_HOST,
        port=config.ML_SERVICE_PORT,
        reload=reload_mode
    )

# Debug
@app.get("/api/model/debug/tree-count")
async def debug_tree_accuracy():
    """Cek akurasi pada berbagai jumlah tree (tanpa retrain)"""
    if not ml_service.is_trained:
        raise HTTPException(status_code=400, detail="Model not trained")
    
    import numpy as np
    from sklearn.metrics import accuracy_score
    
    # Gunakan OOB predictions yang sudah ada
    results = {}
    for n in [100, 200, 300, 500, 800, 1200]:
        if n <= len(ml_service.model.estimators_):
            # Subset estimators
            original = ml_service.model.estimators_
            ml_service.model.estimators_ = original[:n]
            # OOB score sebagai proxy
            results[n] = ml_service.model.oob_score_ if hasattr(ml_service.model, 'oob_score_') else "N/A"
            ml_service.model.estimators_ = original
    
    return {"tree_counts": results, "current": len(ml_service.model.estimators_)}
