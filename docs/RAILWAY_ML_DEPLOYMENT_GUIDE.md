# Railway ML Service Deployment Guide

Guide lengkap untuk deploy ML Service terpisah di Railway untuk project IPTV Monitor.

## Architecture Overview

```
Frontend (Vercel)
    ↓
Backend (Railway - iptv-monitor-backend-production)
    ↓
ML Service (Railway - iptv-ml-service) ← SERVICE BARU
    ↓
MongoDB Atlas (Shared)
```

## Part 1: ML Service Setup (iptv-ml-service)

### 1. Buat Project Baru di Railway

1. Login ke [Railway](https://railway.app/)
2. Klik **New Project** → **Deploy from GitHub repo**
3. Pilih repository IPTV monitor Anda
4. Configure:
   - **Root Directory**: `backend/ml-service` (atau buat directory terpisah)
   - **Runtime**: Python
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`

### 2. Buat ML Service Structure

Buat directory `backend/ml-service/` dengan struktur:

```
backend/ml-service/
├── main.py                 # FastAPI app entry point
├── requirements.txt        # Python dependencies
├── model/
│   ├── ml_model.pkl        # Trained model
│   └── vectorizer.pkl      # Text vectorizer
├── utils.py               # Helper functions
└── Railway.app            # Railway configuration
```

### 3. Create `requirements.txt`

```txt
fastapi==0.104.1
uvicorn[standard]==0.24.0
pydantic==2.5.0
scikit-learn==1.3.2
pandas==2.1.3
numpy==1.26.2
python-multipart==0.0.6
joblib==1.3.2
```

### 4. Create `main.py` (FastAPI)

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import joblib
import os
from typing import List, Optional

app = FastAPI(title="IPTV ML Service", version="1.0.0")

# Load model and vectorizer
MODEL_PATH = os.path.join(os.path.dirname(__file__), 'model')
model = None
vectorizer = None

@app.on_event("startup")
async def load_model():
    global model, vectorizer
    try:
        model = joblib.load(f"{MODEL_PATH}/ml_model.pkl")
        vectorizer = joblib.load(f"{MODEL_PATH}/vectorizer.pkl")
        print("Model and vectorizer loaded successfully")
    except Exception as e:
        print(f"Error loading model: {e}")

class PredictionRequest(BaseModel):
    text: str
    include_probabilities: bool = True

class Probability(BaseModel):
    label: str
    probability: float

class PredictionResponse(BaseModel):
    predicted_label: str
    probabilities: Optional[List[Probability]] = None
    confidence: float
    cleaned_text: str

@app.get("/health")
async def health_check():
    return {"status": "healthy", "model_loaded": model is not None}

@app.post("/predict", response_model=PredictionResponse)
async def predict(request: PredictionRequest):
    if model is None or vectorizer is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    try:
        # Clean text
        cleaned_text = clean_text(request.text)

        # Vectorize
        text_vectorized = vectorizer.transform([cleaned_text])

        # Predict
        prediction = model.predict(text_vectorized)[0]
        probabilities = model.predict_proba(text_vectorized)[0]

        # Get probability for predicted class
        confidence = float(max(probabilities))
        class_labels = model.classes_
        predicted_label = class_labels[prediction]

        # Format probabilities if requested
        probs_list = None
        if request.include_probabilities:
            probs_list = [
                Probability(label=str(label), probability=float(prob))
                for label, prob in zip(class_labels, probabilities)
            ]
            probs_list.sort(key=lambda x: x.probability, reverse=True)

        return PredictionResponse(
            predicted_label=predicted_label,
            probabilities=probs_list,
            confidence=confidence,
            cleaned_text=cleaned_text
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def clean_text(text):
    # Implement text cleaning logic
    import re
    text = text.lower()
    text = re.sub(r'[^\w\s]', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8001)))
```

### 5. Environment Variables di Railway

Set di project ML Service Railway:

```bash
# Database
MONGO_URL=mongodb+srv://mekd1bro:727PlayingCards@cluster0.wnmnw.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0

# API
PORT=8001

# Optional: Model Configuration
MODEL_VERSION=1.0.0
CONFIDENCE_THRESHOLD=0.70
```

### 6. Deploy ML Service

Klik **Deploy** di Railway. Tunggu sampai deployment selesai.

Copy URL ML Service yang sudah terdeploy:
```
https://iptv-ml-service.up.railway.app
```

## Part 2: Update Backend Configuration

### 1. Update Production Environment Variables

Di Railway backend project (`iptv-monitor-backend-production`), update environment variables:

```bash
# ML Service Configuration
ML_SERVICE_URL=https://iptv-ml-service.up.railway.app
ML_SERVICE_TIMEOUT=30000

# Production
NODE_ENV=production
BASE_URL=https://iptv-monitor-backend-production.up.railway.app
FRONTEND_URL=https://iptv-monitor.vercel.app
TELEGRAM_BOT_TOKEN=8204134899:AAGxxSkqwk7iFkOzJcgZiolQspMeTkGfxHE

# Other existing vars...
JWT_SECRET=...
MONGO_URL=...
GEMINI_API_KEY=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

### 2. Redeploy Backend

Setelah update environment variables, backend akan otomatis redeploy.

## Part 3: Verifikasi Deployment

### 1. Test ML Service Health

```bash
curl https://iptv-ml-service.up.railway.app/health
```

Expected response:
```json
{
  "status": "healthy",
  "model_loaded": true
}
```

### 2. Test ML Prediction

```bash
curl -X POST https://iptv-ml-service.up.railway.app/predict \
  -H "Content-Type: application/json" \
  -d '{"text": "No Device Found Chromecast", "include_probabilities": true}'
```

Expected response:
```json
{
  "predicted_label": "Kategori-1",
  "probabilities": [
    {"label": "Kategori-1", "probability": 0.85},
    ...
  ],
  "confidence": 0.85,
  "cleaned_text": "no device found chromecast"
}
```

### 3. Test Backend Integration

Di backend, test endpoint yang menggunakan ML service:

```bash
curl -X POST https://iptv-monitor-backend-production.up.railway.app/api/autofix/analyze \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"notification": {"title": "Error", "message": "No Device Found"}}'
```

## Troubleshooting

### ML Service Error: Model Not Loaded

**Problem**: Model files not found
**Solution**:
1. Upload model files ke repository
2. Atau use Railway volumes untuk persistent storage
3. Atau load model dari external storage (S3, GCS)

### Backend Cannot Connect to ML Service

**Problem**: Connection timeout
**Solution**:
1. Check ML_SERVICE_URL is correct
2. Check ML service is deployed and running
3. Increase ML_SERVICE_TIMEOUT if needed
4. Check Railway logs for network errors

### CORS Issues

**Problem**: Frontend cannot access ML service directly
**Solution**: ML service harus diakses lewat backend, bukan langsung dari frontend. Backend acts as proxy.

## Environment Variables Summary

### Backend (iptv-monitor-backend-production)

```bash
# Local Development
ML_SERVICE_URL=http://localhost:8001

# Production
ML_SERVICE_URL=https://iptv-ml-service.up.railway.app
ML_SERVICE_TIMEOUT=30000
```

### ML Service (iptv-ml-service)

```bash
PORT=8001
MONGO_URL=mongodb+srv://...
MODEL_VERSION=1.0.0
CONFIDENCE_THRESHOLD=0.70
```

## Cost Estimation

Railway pricing (per service):
- **Free Plan**: $5/month credit
- **Pay-as-you-go**: ~$5-10/month per service

Total for both services: ~$10-20/month

## Next Steps

1. ✅ Deploy ML service ke Railway
2. ✅ Update backend environment variables
3. ✅ Test deployment
4. ⏭️ Setup monitoring dan alerts
5. ⏭️ Configure auto-scaling jika needed
6. ⏭️ Setup CI/CD untuk automatic deployment

## Maintenance

### Update ML Model

1. Train new model
2. Upload ke repository
3. Deploy ke Railway (otomatis)
4. Monitor performance

### Scaling

Railway otomatis scaling, tapi bisa configure manual:
- Min instances: 1
- Max instances: 3

---

**Questions?** Check Railway docs: https://docs.railway.app/
