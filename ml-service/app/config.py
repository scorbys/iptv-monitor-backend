import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    # Railway provides PORT env var - MUST use it
    # Check if PORT is set, otherwise use ML_SERVICE_PORT or 8080
    port_env = os.getenv("PORT")
    if port_env:
        try:
            ML_SERVICE_PORT = int(port_env)
        except ValueError:
            raise ValueError("Invalid PORT environment variable")
    else:
        ml_port = os.getenv("ML_SERVICE_PORT", "8080")
        try:
            ML_SERVICE_PORT = int(ml_port)
        except ValueError:
            raise ValueError("Invalid ML_SERVICE_PORT environment variable")

    ML_SERVICE_HOST = os.getenv("ML_SERVICE_HOST", "0.0.0.0")
    CORS_ORIGINS_STR = os.getenv("CORS_ORIGINS", "http://localhost:3000")
    CORS_ORIGINS = [origin.strip() for origin in CORS_ORIGINS_STR.split(",") if origin.strip()]

    ARTIFACTS_DIR = os.getenv("ARTIFACTS_DIR", "./artifacts")
    DATA_DIR = os.getenv("DATA_DIR", "./data")

    LOG_LEVEL = os.getenv("LOG_LEVEL", "info").lower()
    if LOG_LEVEL not in ["debug", "info", "warning", "error", "critical"]:
        LOG_LEVEL = "info"

    # Model configuration
    MODEL_NAME = "rf_model.pkl"
    TFIDF_NAME = "tfidf.pkl"
    LABEL_ENCODER_NAME = "label_encoder.pkl"
    STOPWORDS_NAME = "stopwords.pkl"

    # Training configuration
    TRAIN_TEST_SPLIT_STR = os.getenv("TRAIN_TEST_SPLIT", "0.2")
    try:
        TRAIN_TEST_SPLIT = float(TRAIN_TEST_SPLIT_STR)
        if not 0 < TRAIN_TEST_SPLIT < 1:
            raise ValueError
    except ValueError:
        raise ValueError("TRAIN_TEST_SPLIT must be a float between 0 and 1")

    RANDOM_STATE_STR = os.getenv("RANDOM_STATE", "42")
    try:
        RANDOM_STATE = int(RANDOM_STATE_STR)
    except ValueError:
        raise ValueError("RANDOM_STATE must be an integer")

    MAX_FEATURES_STR = os.getenv("MAX_FEATURES", "8000")
    try:
        MAX_FEATURES = int(MAX_FEATURES_STR)
        if MAX_FEATURES <= 0:
            raise ValueError
    except ValueError:
        raise ValueError("MAX_FEATURES must be a positive integer")

    NGRAM_RANGE_STR = os.getenv("NGRAM_RANGE", "1,2")
    try:
        ngram_parts = [int(x.strip()) for x in NGRAM_RANGE_STR.split(",")]
        if len(ngram_parts) != 2 or ngram_parts[0] > ngram_parts[1]:
            raise ValueError
        NGRAM_RANGE = tuple(ngram_parts)
    except ValueError:
        raise ValueError("NGRAM_RANGE must be two integers separated by comma, e.g., '1,2'")

    # SMOTE configuration
    SMOTE_ENABLED_STR = os.getenv("SMOTE_ENABLED", "false").lower()
    SMOTE_ENABLED = SMOTE_ENABLED_STR in ["true", "1", "yes", "on"]

config = Config()
