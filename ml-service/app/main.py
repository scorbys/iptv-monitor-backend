from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import os
import shutil
import logging
import asyncio
import time
from concurrent.futures import ThreadPoolExecutor

from app.config import config
from utils import ml_service

# Thread pool for blocking operations
thread_pool = ThreadPoolExecutor(max_workers=1)

# Configure logging
logging.basicConfig(level=config.LOG_LEVEL.upper())
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="IPTV ML Prediction Service",
    description="Machine Learning service for IPTV comment classification",
    version="1.0.0"
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

class TrainResponse(BaseModel):
    success: bool
    message: str
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
    """Get model information"""
    try:
        logger.info("Received request for model info")
        result = ml_service.get_model_info()
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
        result = ml_service.predict(request.text)
        return result
    except Exception as e:
        logger.error(f"Prediction error: {e}")
        raise HTTPException(status_code=500, detail="Prediction failed")

# Train model endpoint
@app.post("/api/model/train", response_model=TrainResponse)
async def train_model(file: UploadFile = File(...), sheet_name: str = "Sheet1"):
    """Train model from uploaded Excel file"""
    try:
        # Input validation
        if not file.filename.lower().endswith(('.xlsx', '.xls')):
            raise HTTPException(status_code=400, detail="Only Excel files (.xlsx, .xls) are allowed")

        if len(sheet_name.strip()) == 0:
            raise HTTPException(status_code=400, detail="Sheet name cannot be empty")

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

        # Train model in thread pool to avoid blocking
        logger.info(f"Starting model training with file: {secure_filename}")

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            thread_pool,
            ml_service.train_from_excel,
            file_path,
            sheet_name
        )

        logger.info(f"Model trained successfully. Accuracy: {result.get('accuracy', 0):.4f}, OOB: {result.get('oob_score', 0):.4f}, Features: {result.get('n_features', 0)}")

        return TrainResponse(
            success=True,
            message="Model trained successfully",
            accuracy=result.get("accuracy"),
            oob_score=result.get("oob_score"),
            classification_report=result.get("classification_report"),
            n_classes=result.get("n_classes"),
            classes=result.get("classes"),
            n_features=result.get("n_features")
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Training error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Training failed: {str(e)}")

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

        return {"success": True, "message": "Model deleted successfully"}

    except Exception as e:
        logger.error(f"Delete model error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=config.ML_SERVICE_HOST,
        port=config.ML_SERVICE_PORT,
        reload=True
    )
