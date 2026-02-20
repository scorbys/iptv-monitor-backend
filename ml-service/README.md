# IPTV ML Prediction Service

Machine Learning service untuk klasifikasi komentar IPTV menggunakan Random Forest.

## Installation

1. Install Python dependencies:
```bash
cd backend/ml-service
pip install -r requirements.txt
```

2. Configure environment variables (opsional, sudah ada default di `.env`):
```bash
cp .env .env.local
# Edit .env.local jika perlu mengubah konfigurasi
```

## Running the Service

### Development mode:
```bash
cd backend/ml-service
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

### Production mode:
```bash
cd backend/ml-service
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --workers 4
```

Service akan berjalan di `http://localhost:8001`

## API Documentation

Setelah service berjalan, buka:
- Swagger UI: `http://localhost:8001/docs`
- ReDoc: `http://localhost:8001/redoc`

## API Endpoints

### 1. Health Check
```
GET /health
```

### 2. Get Model Info
```
GET /api/model/info
```

### 3. Predict
```
POST /api/predict
Content-Type: application/json

{
  "text": "access point broken"
}
```

### 4. Train Model
```
POST /api/model/train
Content-Type: multipart/form-data

file: <Excel file>
sheet_name: "Sheet1" (optional)
```

### 5. Delete Model
```
DELETE /api/model
```

## File Structure

```
ml-service/
├── app/
│   ├── __init__.py
│   ├── config.py          # Configuration
│   └── main.py            # FastAPI app & routes
├── utils/
│   ├── __init__.py
│   ├── preprocessing.py   # Text preprocessing (Sastrawi)
│   └── model_service.py   # ML model operations
├── artifacts/             # Saved models (generated after training)
│   ├── rf_model.pkl
│   ├── tfidf.pkl
│   ├── label_encoder.pkl
│   └── stopwords.pkl
├── data/                  # Training data (uploaded)
├── requirements.txt
├── .env
└── README.md
```

## Training Model

1. Siapkan file Excel dengan kolom:
   - Kolom komentar (harus mengandung kata "comment", "update", atau "koment")
   - Kolom kategori/label (harus mengandung kata "kategori", "category", atau "class")

2. Upload file Excel melalui API:
```bash
curl -X POST "http://localhost:8001/api/model/train" \
  -F "file=@/path/to/dataset.xlsx" \
  -F "sheet_name=Sheet1"
```

3. Model artifacts akan disimpan di folder `artifacts/`

## Model Information

- **Algorithm**: Balanced Random Forest
- **N Estimators**: 1200
- **Max Features**: sqrt
- **Text Processing**: TF-IDF (1-2 grams)
- **Preprocessing**: Sastrawi (Indonesian stemming & stopwords)
- **Handling Imbalance**: SMOTE + Balanced Random Forest

## Integration with Node.js Backend

ML service ini berjalan sebagai microservice terpisah. Node.js backend dapat mengaksesnya melalui HTTP API.

Contoh integration di Node.js:
```javascript
const axios = require('axios');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8001';

// Predict
async function predict(text) {
  const response = await axios.post(`${ML_SERVICE_URL}/api/predict`, { text });
  return response.data;
}

// Train model
async function trainModel(excelFile) {
  const formData = new FormData();
  formData.append('file', excelFile);
  formData.append('sheet_name', 'Sheet1');

  const response = await axios.post(`${ML_SERVICE_URL}/api/model/train`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data;
}
```

## Troubleshooting

### Model tidak terload
- Pastikan file artifacts ada di folder `artifacts/`
- Cek log service untuk error details

### Training gagal
- Pastikan format Excel sesuai (ada kolom komentar dan kategori)
- Cek apakah sheet_name benar

### Port conflict
- Ubah `ML_SERVICE_PORT` di file `.env`
