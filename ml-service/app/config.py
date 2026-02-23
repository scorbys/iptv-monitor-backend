import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    # Railway provides PORT env var - MUST use it
    # Check if PORT is set, otherwise use ML_SERVICE_PORT or 8080
    port_env = os.getenv("PORT")
    if port_env:
        ML_SERVICE_PORT = int(port_env)
    else:
        ML_SERVICE_PORT = int(os.getenv("ML_SERVICE_PORT", "8080"))

    ML_SERVICE_HOST = os.getenv("ML_SERVICE_HOST", "0.0.0.0")
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
    ARTIFACTS_DIR = os.getenv("ARTIFACTS_DIR", "./artifacts")
    DATA_DIR = os.getenv("DATA_DIR", "./data")
    LOG_LEVEL = os.getenv("LOG_LEVEL", "info")

    # Model configuration
    MODEL_NAME = "rf_model.pkl"
    TFIDF_NAME = "tfidf.pkl"
    LABEL_ENCODER_NAME = "label_encoder.pkl"
    STOPWORDS_NAME = "stopwords.pkl"

    # Training configuration
    TRAIN_TEST_SPLIT = 0.2
    RANDOM_STATE = 42
    MAX_FEATURES = 12000
    NGRAM_RANGE = (1, 2)

config = Config()
