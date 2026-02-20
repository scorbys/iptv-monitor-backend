# MongoDB Database Relationships & Schema Documentation

## 📊 Overview

Database `iptv` menggunakan **Reference-based Relationships** (mirip Foreign Key di SQL) untuk menghubungkan collections. Ini bukan embedded documents, melainkan references menggunakan `ObjectId`.

---

## 🔗 COMPLETE DATABASE RELATIONSHIPS DIAGRAM

### **High-Level Entity Relationship Diagram (ERD)**

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                        IPTV DATABASE - ENTITY RELATIONSHIPS                   ║
╚══════════════════════════════════════════════════════════════════════════════╝

┌─────────────────┐
│   login_page    │
├─────────────────┤
│ PK _id          │◄────────────────────────────────────┐
│    username     │                                      │
│    password     │                                      │
│    email        │                                      │
│    role         │                                      │
│    createdAt    │                                      │
└─────────────────┘                                      │
          │                                               │
          │ FK: staff.userId                             │
          │ Cardinality: 1:1                             │
          │ One login_page → One staff                   │
          ▼                                               │
┌─────────────────┐                                      │
│     staff       │                                      │
├─────────────────┤                                      │
│ PK _id          │──┐                                   │
│ FK userId       │  │                                   │
│    name         │  │                                   │
│    email        │  │ FK: notifications.reportedByStaffId│
│    phone        │  │ Cardinality: 1:M                  │
│    department   │  │ One staff → Many notifications    │
│    role         │  │                                   │
│    isActive     │  ├──┐                                │
│    stats        │  │  │ FK: notifications.assignedStaffId│
│    createdAt    │  │  │ Cardinality: 1:M                 │
│    updatedAt    │  │  │ One staff → Many notifications  │
└─────────────────┘  │  │                                │
                     │  ├──┐                             │
                     │  │  │ FK: notifications.handledByStaffId│
                     │  │  │ Cardinality: 1:M                  │
                     │  │  │ One staff → Many notifications    │
                     │  │  │                                  │
                     │  │  ├──┐                               │
                     │  │  │  │ FK: notifications.notes[].staffId│
                     │  │  │  │ Cardinality: 1:M                 │
                     │  │  │  │ One staff → Many notes          │
                     │  │  │  │                                  │
                     │  │  │  │                                  │
                     │  ▼  ▼  ▼                                  │
                     │ ┌─────────────────┐                       │
                     │ │  notifications  │                       │
                     │ ├─────────────────┤                       │
                     │ │ PK _id          │                       │
                     │ │    notificationId│──────────────────────┼──────┐
                     │ │    title        │                       │      │
                     │ │    message      │                       │      │
                     │ │    source       │                       │      │
                     │ │    type         │                       │      │
                     │ │    deviceName   │                       │      │
                     │ │    roomNo       │                       │      │
                     │ │    ipAddr       │                       │      │
                     │ │    error        │                       │      │
                     │ │    errorCategory│                       │      │
                     │ │    currentStatus│                       │      │
                     │ │    reportStatus │                       │      │
                     │ │    priority     │                       │      │
                     │ │    createdAt    │                       │      │
                     │ │    updatedAt    │                       │      │
                     │ └─────────────────┘                       │      │
                     │         ▲                                 │      │
                     │         │ FK: auto_fix_logs.notificationId│      │
                     │         │ Cardinality: 1:M                 │      │
                     │         │ One notification → Many auto_fix_logs│     │
                     │         │                                  │      │
                     │         ▼                                  │      │
                     │    ┌─────────────────┐                     │      │
                     │    │  auto_fix_logs  │                     │      │
                     │    ├─────────────────┤                     │      │
                     │    │ PK _id          │                     │      │
                     │    │    fixId        │                     │      │
                     │    │ FK notificationId│────────────────────┘      │
                     │    │ FK mlPredictionId│──────────────────────────┐ │
                     │    │    fixType      │                          │ │
                     │    │    category     │                          │ │
                     │    │    action       │                          │ │
                     │    │    status       │                          │ │
                     │    │    confidence   │                          │ │
                     │    │ FK triggeredBy  │──┐                       │ │
                     │    │ FK approvedBy   │  │ FK: staff._id         │ │
                     │    │ FK executedBy   │  │ Cardinality: 1:M      │ │
                     │    │    createdAt    │  │ One staff → Many     │ │
                     │    │    executedAt   │  │ auto_fix_logs        │ │
                     │    │    completedAt  │  │                      │ │
                     │    └─────────────────┘  │                      │ │
                     │                          │                      │ │
                     │    ┌─────────────────┐   │                      │ │
                     │    │ ml_predictions  │◄──┘                      │ │
                     │    ├─────────────────┤                          │ │
                     │    │ PK _id          │                          │ │
                     │    │    predictionId │                          │ │
                     │    │ FK notificationId│─────────────────────────┘ │
                     │    │    inputText    │                            │
                     │    │    cleanedText  │                            │
                     │    │    predictedCategory│                         │
                     │    │    confidence   │                            │
                     │    │    probabilities│                            │
                     │    │    features     │                            │
                     │    │    createdAt    │                            │
                     │    └─────────────────┘                            │
                     │                                                       │
                     └───────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════════════
```

---

### **Detailed Relationship Diagram dengan Field Lengkap**

```
╔══════════════════════════════════════════════════════════════════════════════╗
║              DETAILED COLLECTION RELATIONSHIPS - WITH FIELDS                ║
╚══════════════════════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────────────────────────────────────────────┐
│  1. login_page Collection                                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Field Name     │ Type    │ Description                                   │
│  ───────────────┼─────────┼──────────────────────────────────────────────  │
│  _id            │ ObjectId│ PRIMARY KEY                                   │
│  username       │ String  │ Unique username                               │
│  password       │ String  │ Hashed password                               │
│  email          │ String  │ Email address                                 │
│  role           │ String  │ Role: admin, staff, user                      │
│  createdAt      │ Date    │ Account creation date                         │
│  updatedAt      │ Date    │ Last update date                              │
│                                                                             │
│  RELATIONSHIPS:                                                              │
│  ─────────────                                                              │
│  One-to-One with staff:                                                     │
│    → staff.userId references login_page._id                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ staff.userId (FK)
                                    │ One-to-One
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  2. staff Collection                                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Field Name       │ Type    │ Description                                  │
│  ─────────────────┼─────────┼─────────────────────────────────────────────  │
│  _id              │ ObjectId│ PRIMARY KEY                                  │
│  userId           │ ObjectId│ FOREIGN KEY → login_page._id                 │
│  name             │ String  │ Staff full name                              │
│  email            │ String  │ UNIQUE email address                         │
│  phone            │ String  │ Phone number                                 │
│  department       │ String  │ Department: IT Support, Network, etc.        │
│  role             │ String  │ Role: Admin, Technician, Supervisor          │
│  isActive         │ Boolean │ Staff active status                          │
│  avatar           │ String  │ Avatar image URL                             │
│  stats            │ Object  │ Statistics object                            │
│  │ totalAssigned  │ Number  │ Total notifications assigned                │
│  │ totalResolved  │ Number  │ Total notifications resolved                │
│  │ avgResolutionTime│ Number│ Average resolution time (minutes)          │
│  │ successRate    │ Number  │ Resolution success rate (%)                 │
│  createdAt        │ Date    │ Record creation date                         │
│  updatedAt        │ Date    │ Last update date                             │
│                                                                             │
│  RELATIONSHIPS:                                                              │
│  ─────────────                                                              │
│  Many-to-One with login_page:                                                │
│    → staff.userId → login_page._id                                           │
│                                                                             │
│  One-to-Many with notifications (3 relationships):                           │
│    → notifications.reportedByStaffId → staff._id                             │
│    → notifications.assignedStaffId → staff._id                              │
│    → notifications.handledByStaffId → staff._id                              │
│    → notifications.notes[].staffId → staff._id                               │
│                                                                             │
│  One-to-Many with auto_fix_logs (3 relationships):                           │
│    → auto_fix_logs.triggeredBy → staff._id                                   │
│    → auto_fix_logs.approvedBy → staff._id                                    │
│    → auto_fix_logs.executedBy → staff._id                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    │ reportedBy    │ assigned      │ handledBy
                    │ StaffId       │ StaffId       │ StaffId
                    │ (FK)          │ (FK)          │ (FK)
                    │ Many-to-One  │ Many-to-One  │ Many-to-One
                    ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  3. notifications Collection                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Field Name            │ Type     │ Description                            │
│  ──────────────────────┼──────────┼───────────────────────────────────────  │
│  _id                   │ ObjectId │ PRIMARY KEY                            │
│  notificationId        │ String   │ UNIQUE Business Key                   │
│  title                 │ String   │ Notification title                     │
│  message               │ String   │ Notification message                   │
│  source                │ String   │ Source: chromecast, telegram, etc.    │
│  type                  │ String   │ Type: error, warning, info            │
│  deviceName            │ String   │ Device name                            │
│  roomNo                │ String   │ Room number                            │
│  ipAddr                │ String   │ IP address                             │
│  error                 │ String   │ Error message                          │
│  errorCategory         │ String   │ Error category                         │
│  currentStatus         │ String   │ Current status: online, offline        │
│  previousStatus        │ String   │ Previous status                        │
│  isStatusChange        │ Boolean  │ Whether this is a status change        │
│  responseTime          │ Number   │ Response time in ms                    │
│  signalLevel           │ String   │ Signal strength                        │
│  suggestedSolutions    │ Array    │ Suggested solutions                    │
│  rawDate               │ Date     │ Raw date from source                   │
│  ──────────────────────┼──────────┼───────────────────────────────────────  │
│  FK reportedByStaffId  │ ObjectId │ → staff._id                            │
│  FK assignedStaffId    │ ObjectId │ → staff._id                            │
│  FK handledByStaffId   │ ObjectId │ → staff._id                            │
│  handlingStartTime     │ Date     │ When handling started                  │
│  handlingEndTime       │ Date     │ When handling ended                    │
│  notes                 │ Array    │ Array of note objects:                │
│  │ ── staffId         │ ObjectId │ → staff._id                            │
│  │ ── staffName       │ String   │ Staff name                             │
│  │ ── note            │ String   │ Note content                           │
│  │ ── timestamp       │ Date     │ Note timestamp                         │
│  reportStatus          │ String   │ pending, investigating, resolved, closed│
│  priority              │ String   │ low, medium, high, critical            │
│  createdAt             │ Date     │ Creation timestamp                     │
│  updatedAt             │ Date     │ Update timestamp                       │
│                                                                             │
│  RELATIONSHIPS:                                                              │
│  ─────────────                                                              │
│  Many-to-One with staff (via 3 fields):                                     │
│    → reportedByStaffId → staff._id (Staff who reported)                     │
│    → assignedStaffId → staff._id (Staff assigned)                           │
│    → handledByStaffId → staff._id (Staff who handled)                       │
│    → notes[].staffId → staff._id (Staff who wrote note)                     │
│                                                                             │
│  One-to-Many with auto_fix_logs:                                             │
│    → auto_fix_logs.notificationId → notifications.notificationId             │
│                                                                             │
│  One-to-Many with ml_predictions:                                            │
│    → ml_predictions.notificationId → notifications.notificationId            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ notificationId (FK)
                                    │ One-to-Many
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  4. auto_fix_logs Collection                                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Field Name          │ Type     │ Description                              │
│  ────────────────────┼──────────┼───────────────────────────────────────  │
│  _id                 │ ObjectId │ PRIMARY KEY                              │
│  fixId               │ String   │ UNIQUE Business Key                     │
│  FK notificationId   │ String   │ → notifications.notificationId          │
│  FK mlPredictionId   │ ObjectId │ → ml_predictions._id                    │
│  fixType             │ String   │ automatic, manual, hybrid                │
│  category            │ String   │ Kategori-1 through Kategori-11          │
│  action              │ String   │ Action command: restart_chromecast, etc.│
│  description         │ String   │ Human-readable description              │
│  command             │ String   │ Command to execute                      │
│  status              │ String   │ pending, executing, success, failed, cancelled│
│  confidence          │ Number   │ ML confidence score (0-1)               │
│  createdBy           │ String   │ system, user, ml, or userId             │
│  ────────────────────┼──────────┼───────────────────────────────────────  │
│  FK triggeredBy      │ ObjectId │ → staff._id                              │
│  FK approvedBy       │ ObjectId │ → staff._id                              │
│  FK executedBy       │ ObjectId │ → staff._id or 'system'                  │
│  createdAt           │ Date     │ Creation timestamp                      │
│  executedAt          │ Date     │ Execution start timestamp               │
│  completedAt         │ Date     │ Completion timestamp                    │
│  result              │ Object   │ Execution result object                 │
│  errorMessage        │ String   │ Error message if failed                  │
│  retryCount          │ Number   │ Number of retry attempts                │
│  maxRetries          │ Number   │ Maximum retry attempts (default: 3)     │
│  notes               │ Array    │ Array of note objects:                  │
│  │ ── userId         │ ObjectId │ → staff._id                             │
│  │ ── note           │ String   │ Note content                            │
│  │ ── timestamp      │ Date     │ Note timestamp                          │
│                                                                             │
│  RELATIONSHIPS:                                                              │
│  ─────────────                                                              │
│  Many-to-One with notifications:                                             │
│    → notificationId (String) → notifications.notificationId (String)        │
│                                                                             │
│  Many-to-One with ml_predictions:                                            │
│    → mlPredictionId (ObjectId) → ml_predictions._id (ObjectId)              │
│                                                                             │
│  Many-to-One with staff (via 3 fields):                                     │
│    → triggeredBy → staff._id (Staff who manually triggered)                 │
│    → approvedBy → staff._id (Staff who approved)                             │
│    → executedBy → staff._id (Staff who executed or 'system')                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ mlPredictionId (FK)
                                    │ Many-to-One
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  5. ml_predictions Collection                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Field Name            │ Type     │ Description                            │
│  ──────────────────────┼──────────┼───────────────────────────────────────  │
│  _id                   │ ObjectId │ PRIMARY KEY                            │
│  predictionId          │ String   │ UNIQUE Business Key                   │
│  FK notificationId     │ String   │ → notifications.notificationId        │
│  inputText             │ String   │ Original input text for prediction    │
│  cleanedText           │ String   │ Cleaned/preprocessed text             │
│  predictedCategory     │ String   │ Predicted: Kategori-1 through Kategori-11│
│  confidence            │ Number   │ Confidence score (0-1)                 │
│  probabilities         │ Array    │ Array of probability objects:          │
│  │ ── label           │ String   │ Category label                         │
│  │ ── probability     │ Number   │ Probability value                      │
│  features             │ Object   │ Extracted features object              │
│  suggestedSolutions   │ Array    │ Suggested solutions based on category  │
│  createdAt            │ Date     │ Prediction timestamp                   │
│                                                                             │
│  RELATIONSHIPS:                                                              │
│  ─────────────                                                              │
│  Many-to-One with notifications:                                             │
│    → notificationId (String) → notifications.notificationId (String)        │
│                                                                             │
│  One-to-One with auto_fix_logs:                                              │
│    → auto_fix_logs.mlPredictionId → ml_predictions._id                      │
│    One ML prediction is used by one auto-fix log                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════════════
```

---

## 📊 Relationship Matrix Table

| From Collection | From Field | To Collection | To Field | Relationship | Cardinality |
|----------------|------------|--------------|----------|--------------|-------------|
| **staff** | userId | login_page | _id | FK | 1:1 |
| **notifications** | reportedByStaffId | staff | _id | FK | M:1 |
| **notifications** | assignedStaffId | staff | _id | FK | M:1 |
| **notifications** | handledByStaffId | staff | _id | FK | M:1 |
| **notifications.notes[]** | staffId | staff | _id | FK | M:1 |
| **auto_fix_logs** | notificationId | notifications | notificationId | FK | M:1 |
| **auto_fix_logs** | mlPredictionId | ml_predictions | _id | FK | M:1 |
| **auto_fix_logs** | triggeredBy | staff | _id | FK | M:1 |
| **auto_fix_logs** | approvedBy | staff | _id | FK | M:1 |
| **auto_fix_logs** | executedBy | staff | _id | FK | M:1 |
| **ml_predictions** | notificationId | notifications | notificationId | FK | M:1 |

**Legend:**
- **PK** = Primary Key
- **FK** = Foreign Key
- **M:1** = Many-to-One (Many records in source → One record in target)
- **1:1** = One-to-One (One record → One record)

---

## 🔍 Visual Relationship Flow dengan Contoh Data

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                    DATA FLOW EXAMPLE - COMPLETE CHAIN                        ║
╚══════════════════════════════════════════════════════════════════════════════╝

SCENARIO: User logs in → Staff reports notification → ML predicts → Auto-fix executes

┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 1: User Authentication                                                   │
└──────────────────────────────────────────────────────────────────────────────┘

login_page:
{
  "_id": ObjectId("507f1f77bcf86cd799439020"),
  "username": "admin",
  "password": "$2a$10$hashed_password",
  "email": "admin@iptv.com",
  "role": "admin"
}
                    │
                    │ userId (FK)
                    ▼
staff:
{
  "_id": ObjectId("507f1f77bcf86cd799439011"),  ← Referenced by notifications
  "userId": ObjectId("507f1f77bcf86cd799439020"),  ← References login_page
  "name": "Admin User",
  "email": "admin@iptv.com",
  "department": "IT Support",
  "role": "Admin"
}

┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 2: Staff Reports Notification                                            │
└──────────────────────────────────────────────────────────────────────────────┘

notifications:
{
  "_id": ObjectId("507f1f77bcf86cd799439012"),
  "notificationId": "chromecast-1739999838400",  ← Referenced by auto_fix_logs & ml_predictions
  "title": "Chromecast Device Offline",
  "message": "Device not responding",
  "source": "chromecast",
  "type": "error",
  "deviceName": "Living Room TV",
  "roomNo": "101",
  "ipAddr": "192.168.1.100",
  "error": "No device found",
  "errorCategory": "Device",
  "currentStatus": "offline",

  // STAFF TRACKING (3 Foreign Keys to staff)
  "reportedByStaffId": ObjectId("507f1f77bcf86cd799439011"),  ← References staff._id
  "assignedStaffId": null,                                   // Not assigned yet
  "handledByStaffId": null,                                   // Not handled yet

  "notes": [
    {
      "staffId": ObjectId("507f1f77bcf86cd799439011"),        ← References staff._id
      "staffName": "Admin User",
      "note": "Device offline, investigating",
      "timestamp": ISODate("2026-02-20T10:30:00Z")
    }
  ],

  "reportStatus": "pending",
  "priority": "medium",
  "createdAt": ISODate("2026-02-20T10:30:00Z")
}

┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 3: ML Service Predicts Category                                         │
└──────────────────────────────────────────────────────────────────────────────┘

ml_predictions:
{
  "_id": ObjectId("507f1f77bcf86cd799439015"),           ← Referenced by auto_fix_logs
  "predictionId": "pred-1739999838401",
  "notificationId": "chromecast-1739999838400",          ← References notifications.notificationId
  "inputText": "Chromecast Device Offline No device found",
  "cleanedText": "chromecast device offline found",
  "predictedCategory": "Kategori-1",                     // No Device Found Chromecast
  "confidence": 0.85,
  "probabilities": [
    { "label": "Kategori-1", "probability": 0.85 },
    { "label": "Kategori-2", "probability": 0.10 },
    { "label": "Kategori-3", "probability": 0.05 }
  ],
  "features": {
    "has_device_keyword": true,
    "has_offline_keyword": true,
    "error_length": 14
  },
  "suggestedSolutions": [
    "Restart Chromecast device",
    "Check power connection",
    "Verify network connectivity"
  ],
  "createdAt": ISODate("2026-02-20T10:30:05Z")
}

┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 4: Auto-Fix Executed                                                    │
└──────────────────────────────────────────────────────────────────────────────┘

auto_fix_logs:
{
  "_id": ObjectId("507f1f77bcf86cd799439013"),
  "fixId": "fix-1739999838402",

  // References notification (String ID, not ObjectId)
  "notificationId": "chromecast-1739999838400",          ← References notifications.notificationId

  // References ML prediction (ObjectId)
  "mlPredictionId": ObjectId("507f1f77bcf86cd799439015"), ← References ml_predictions._id

  "fixType": "automatic",
  "category": "Kategori-1",
  "action": "restart_chromecast",
  "description": "Restart Chromecast device via network",
  "command": "restart_chromecast",
  "status": "success",
  "confidence": 0.85,
  "createdBy": "ml",

  // STAFF TRACKING (3 Foreign Keys to staff)
  "triggeredBy": ObjectId("507f1f77bcf86cd799439011"),    ← References staff._id
  "approvedBy": null,                                     // Not required for automatic
  "executedBy": "system",                                 // Or could reference staff._id

  "createdAt": ISODate("2026-02-20T10:30:10Z"),
  "executedAt": ISODate("2026-02-20T10:30:11Z"),
  "completedAt": ISODate("2026-02-20T10:30:15Z"),
  "result": {
    "success": true,
    "message": "Device restarted successfully",
    "responseTime": 4000
  },
  "errorMessage": null,
  "retryCount": 0,
  "maxRetries": 3,
  "notes": []
}

═══════════════════════════════════════════════════════════════════════════════
```

---

## 🔗 Complete Relationship Chain Visualization

```
╔══════════════════════════════════════════════════════════════════════════════╗
║              COMPLETE RELATIONSHIP CHAIN - ALL CONNECTIONS                   ║
╚══════════════════════════════════════════════════════════════════════════════╝

login_page._id (ObjectId: 507f1f77bcf86cd799439020)
        │
        │ 1:1
        ▼
    staff.userId (ObjectId: 507f1f77bcf86cd799439020)
        │
        │ 1:M (staff can have many notifications)
        ├─→ notifications.reportedByStaffId (ObjectId: 507f1f77bcf86cd799439011)
        ├─→ notifications.assignedStaffId (ObjectId: 507f1f77bcf86cd799439011)
        ├─→ notifications.handledByStaffId (ObjectId: 507f1f77bcf86cd799439011)
        └─→ notifications.notes[].staffId (ObjectId: 507f1f77bcf86cd799439011)
                    │
                    │ 1:M (notification can have many auto-fix logs)
                    ▼
        auto_fix_logs.notificationId (String: "chromecast-1739999838400")
                    │
                    │ 1:M (auto-fix log uses one ML prediction)
                    ▼
        auto_fix_logs.mlPredictionId (ObjectId: 507f1f77bcf86cd799439015)
                    │
                    │ 1:1 (ML prediction belongs to one notification)
                    ▼
        ml_predictions.notificationId (String: "chromecast-1739999838400")
                    │
                    │ M:1 (many predictions can belong to one notification)
                    ▼
        notifications.notificationId (String: "chromecast-1739999838400")

═══════════════════════════════════════════════════════════════════════════════

STAFF TO AUTO-FIX RELATIONSHIPS:
────────────────────────────────

staff._id (ObjectId: 507f1f77bcf86cd799439011)
        │
        │ 1:M (staff can trigger many auto-fixes)
        ├─→ auto_fix_logs.triggeredBy (ObjectId: 507f1f77bcf86cd799439011)
        ├─→ auto_fix_logs.approvedBy (ObjectId: 507f1f77bcf86cd799439011)
        └─→ auto_fix_logs.executedBy (ObjectId: 507f1f77bcf86cd799439011 or "system")

═══════════════════════════════════════════════════════════════════════════════
```

---

## 📋 Cardinality & Multiplicity Details

### **One-to-One Relationships (1:1)**

| From | To | Description |
|------|-----|-------------|
| login_page._id | staff.userId | Satu login_page → Satu staff |

### **One-to-Many Relationships (1:M)**

| Parent | Child | Parent Field | Child Field | Description |
|--------|-------|--------------|-------------|-------------|
| staff | notifications | staff._id | notifications.reportedByStaffId | Satu staff → banyak notifications |
| staff | notifications | staff._id | notifications.assignedStaffId | Satu staff → banyak notifications |
| staff | notifications | staff._id | notifications.handledByStaffId | Satu staff → banyak notifications |
| staff | notifications.notes[] | staff._id | notifications.notes[].staffId | Satu staff → banyak notes |
| staff | auto_fix_logs | staff._id | auto_fix_logs.triggeredBy | Satu staff → banyak auto-fix logs |
| staff | auto_fix_logs | staff._id | auto_fix_logs.approvedBy | Satu staff → banyak auto-fix logs |
| staff | auto_fix_logs | staff._id | auto_fix_logs.executedBy | Satu staff → banyak auto-fix logs |
| notifications | auto_fix_logs | notifications.notificationId | auto_fix_logs.notificationId | Satu notification → banyak auto-fix logs |
| notifications | ml_predictions | notifications.notificationId | ml_predictions.notificationId | Satu notification → banyak ML predictions |

### **Many-to-One Relationships (M:1)**

| Child | Parent | Child Field | Parent Field | Description |
|-------|--------|-------------|--------------|-------------|
| staff | login_page | staff.userId | login_page._id | Banyak staff → satu login_page |
| notifications | staff | notifications.reportedByStaffId | staff._id | Banyak notifications → satu staff |
| notifications | staff | notifications.assignedStaffId | staff._id | Banyak notifications → satu staff |
| notifications | staff | notifications.handledByStaffId | staff._id | Banyak notifications → satu staff |
| auto_fix_logs | notifications | auto_fix_logs.notificationId | notifications.notificationId | Banyak auto-fix logs → satu notification |
| auto_fix_logs | ml_predictions | auto_fix_logs.mlPredictionId | ml_predictions._id | Banyak auto-fix logs → satu ML prediction |
| auto_fix_logs | staff | auto_fix_logs.triggeredBy | staff._id | Banyak auto-fix logs → satu staff |
| auto_fix_logs | staff | auto_fix_logs.approvedBy | staff._id | Banyak auto-fix logs → satu staff |
| auto_fix_logs | staff | auto_fix_logs.executedBy | staff._id | Banyak auto-fix logs → satu staff |
| ml_predictions | notifications | ml_predictions.notificationId | notifications.notificationId | Banyak ML predictions → satu notification |

---

## 🎯 Key Types & Reference Patterns

### **ObjectId References (Internal MongoDB IDs)**

Digunakan untuk performa dan consistency:

```javascript
// Example: notifications → staff
reportedByStaffId: ObjectId("507f1f77bcf86cd799439011")  // → staff._id
assignedStaffId: ObjectId("507f1f77bcf86cd799439012")   // → staff._id
handledByStaffId: ObjectId("507f1f77bcf86cd799439013")   // → staff._id

// Example: auto_fix_logs → ml_predictions
mlPredictionId: ObjectId("507f1f77bcf86cd799439015")     // → ml_predictions._id

// Example: staff → login_page
userId: ObjectId("507f1f77bcf86cd799439020")             // → login_page._id
```

### **String ID References (Business Keys)**

Digunakan untuk readable identifiers dan external references:

```javascript
// Example: auto_fix_logs → notifications
notificationId: "chromecast-1739999838400"               // → notifications.notificationId

// Example: ml_predictions → notifications
notificationId: "chromecast-1739999838400"               // → notifications.notificationId
```

### **Mixed References (ObjectId or String)**

```javascript
// Example: auto_fix_logs.executedBy
executedBy: "system"                                      // String value
// OR
executedBy: ObjectId("507f1f77bcf86cd799439011")          // → staff._id
```

---

## 🔑 Index Requirements for Foreign Keys

Untuk performa optimal, foreign key fields harus di-index:

### **staff Collection Indexes:**
```javascript
{ userId: 1 }              // References login_page._id
{ email: 1 }               // UNIQUE
{ department: 1 }
{ isActive: 1 }
{ createdAt: -1 }
```

### **notifications Collection Indexes:**
```javascript
{ notificationId: 1 }      // UNIQUE (Business Key)
{ reportedByStaffId: 1 }   // → staff._id
{ assignedStaffId: 1 }     // → staff._id
{ handledByStaffId: 1 }    // → staff._id
{ source: 1 }
{ currentStatus: 1 }
{ reportStatus: 1 }
{ priority: 1 }
{ createdAt: -1 }
```

### **auto_fix_logs Collection Indexes:**
```javascript
{ fixId: 1 }               // UNIQUE (Business Key)
{ notificationId: 1 }       // → notifications.notificationId
{ mlPredictionId: 1 }      // → ml_predictions._id
{ triggeredBy: 1 }         // → staff._id
{ approvedBy: 1 }          // → staff._id
{ executedBy: 1 }          // → staff._id
{ status: 1 }
{ executedAt: -1 }
```

### **ml_predictions Collection Indexes:**
```javascript
{ predictionId: 1 }        // UNIQUE (Business Key)
{ notificationId: 1 }       // → notifications.notificationId
{ predictedCategory: 1 }
{ confidence: -1 }
{ createdAt: -1 }
```

---

## 📊 Summary Table - All Collections & Relationships

| Collection | PK | FK Fields | Related Collections | Total FKs |
|-----------|-----|-----------|-------------------|-----------|
| **login_page** | _id | - | staff (via staff.userId) | 0 |
| **staff** | _id | userId | login_page (userId) | 1 |
| **notifications** | _id | reportedByStaffId, assignedStaffId, handledByStaffId | staff (3), auto_fix_logs (via notificationId), ml_predictions (via notificationId) | 3 |
| **auto_fix_logs** | _id | notificationId, mlPredictionId, triggeredBy, approvedBy, executedBy | notifications (notificationId), ml_predictions (mlPredictionId), staff (3) | 5 |
| **ml_predictions** | _id | notificationId | notifications (notificationId), auto_fix_logs (via mlPredictionId) | 1 |

**Total Foreign Key Relationships: 10**

---

## ✅ Verification Checklist

Untuk memastikan semua relasi berfungsi dengan benar:

- [ ] **staff.userId** → **login_page._id** (1:1)
- [ ] **notifications.reportedByStaffId** → **staff._id** (M:1)
- [ ] **notifications.assignedStaffId** → **staff._id** (M:1)
- [ ] **notifications.handledByStaffId** → **staff._id** (M:1)
- [ ] **auto_fix_logs.notificationId** → **notifications.notificationId** (M:1)
- [ ] **auto_fix_logs.mlPredictionId** → **ml_predictions._id** (M:1)
- [ ] **auto_fix_logs.triggeredBy** → **staff._id** (M:1)
- [ ] **auto_fix_logs.approvedBy** → **staff._id** (M:1)
- [ ] **auto_fix_logs.executedBy** → **staff._id** (M:1)
- [ ] **ml_predictions.notificationId** → **notifications.notificationId** (M:1)

---

## 🚀 Next Steps

1. **Verify Collections:** Refresh DBSchema untuk melihat semua collections
2. **Check Indexes:** Pastikan semua foreign key fields ter-index
3. **Test Queries:** Gunakan aggregation pipeline untuk join collections
4. **Sample Data:** Gunakan sample data dari `init-database.js` untuk testing

---

## 📚 Related Files

- `backend/init-database.js` - Database initialization script
- `backend/autofix-db.js` - Database operations
- `backend/db.js` - Main database functions
- `backend/staff-db.js` - Staff database operations
- `backend/services/autoFixService.js` - Auto-fix service logic
