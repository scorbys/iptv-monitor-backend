# Database Relationship Guide: Staff ↔ Notifications

## Ringkasan Relasi Database

### Collection yang Terlibat:

1. **`login_page`** - Users dengan role (admin/guest)
2. **`staff`** - Staff profile dengan detail lengkap
3. **`notifications`** - Notifikasi yang dilaporkan dan ditangani oleh staff
4. **`auto_fix_logs`** - Log auto-fix yang bisa dilakukan oleh staff

---

## Skema Relasi

```
login_page (users)
    ↓ (1:1)
staff
    ↓ (1:many)
notifications
    ↓ (1:many)
auto_fix_logs
```

---

## Detail Relasi

### 1. login_page ↔ staff (1:1)

Setiap user di `login_page` bisa memiliki 0 atau 1 profile di `staff`.

**login_page collection**:
```javascript
{
  _id: ObjectId,
  username: String,
  email: String,
  password: String,
  role: "admin" | "guest",  // ← Tambahkan field ini ke existing users
  name: String,
  avatar: String,
  isActive: Boolean,
  createdAt: Date
}
```

**staff collection**:
```javascript
{
  _id: ObjectId,
  name: String,
  email: String (unique),
  phone: String,
  department: String,
  position: String,
  userId: ObjectId,  // ← Link ke login_page._id
  employeeId: String, // Auto-generated: STF-XXX
  isActive: Boolean,
  joinedDate: Date,
  createdAt: Date,
  updatedAt: Date
}
```

**Relasi**:
- `staff.userId` → `login_page._id`

---

### 2. staff ↔ notifications (1:many)

Satu staff bisa melaporkan/menangani banyak notifications.

**staff collection** (fields yang relevan):
```javascript
{
  _id: ObjectId,
  name: String,
  email: String,
  // ... other fields
}
```

**notifications collection**:
```javascript
{
  notificationId: String,
  title: String,
  message: String,
  source: String,
  deviceName: String,
  roomNo: String,
  ipAddr: String,
  error: String,

  // Staff tracking (RELASI KE STAFF)
  reportedByStaffId: ObjectId,  // → staff._id
  assignedStaffId: ObjectId,    // → staff._id
  handledByStaffId: ObjectId,   // → staff._id

  handlingStartTime: Date,
  handlingEndTime: Date,

  notes: [{
    staffId: ObjectId,      // → staff._id
    staffName: String,      // Denormalized for performance
    note: String,
    timestamp: Date
  }],

  reportStatus: String,  // pending, investigating, resolved, closed
  priority: String,      // low, medium, high, critical

  createdAt: Date,
  updatedAt: Date
}
```

**Relasi**:
- `notifications.reportedByStaffId` → `staff._id`
- `notifications.assignedStaffId` → `staff._id`
- `notifications.handledByStaffId` → `staff._id`

---

### 3. notifications ↔ auto_fix_logs (1:many)

Satu notification bisa memiliki banyak auto-fix attempts.

**notifications collection**:
```javascript
{
  notificationId: String,
  // ... other fields
}
```

**auto_fix_logs collection**:
```javascript
{
  fixId: String,
  notificationId: String,  // → notifications.notificationId
  mlPredictionId: ObjectId,
  fixType: String,  // automatic, manual, hybrid
  category: String,
  action: String,
  description: String,
  status: String,  // pending, executing, success, failed, cancelled

  // Staff tracking (RELASI KE STAFF)
  createdBy: String,      // 'system', 'user', 'ml' atau staffId
  triggeredBy: ObjectId,  // → staff._id (user who manually triggered)
  approvedBy: ObjectId,   // → staff._id (user who approved)
  executedBy: ObjectId,   // → staff._id atau 'system'

  createdAt: Date,
  executedAt: Date,
  completedAt: Date
}
```

**Relasi**:
- `auto_fix_logs.notificationId` → `notifications.notificationId`
- `auto_fix_logs.triggeredBy` → `staff._id`
- `auto_fix_logs.approvedBy` → `staff._id`
- `auto_fix_logs.executedBy` → `staff._id`

---

## Database Integration

### Di `db.js`:

Sudah ditambahkan:
- Collection `staff` di `connectDB()`
- Fungsi `getStaffByUserId()` - untuk relasi login_page ↔ staff
- Fungsi `getStaffById()` - dengan notification statistics
- Fungsi `getStaffNotifications()` - dapatkan notifications untuk staff tertentu
- Fungsi `getNotificationsWithStaff()` - join notifications dengan staff details

### Di `autofix-db.js`:

Sudah ditambahkan:
- Collection `staff` di `connectDB()`
- Fungsi `getNotificationWithStaffDetails()` - dapatkan notification dengan staff populated
- Fungsi `getRecentNotificationsWithStaff()` - dapatkan list notifications dengan staff populated
- Fungsi `assignNotificationToStaff()` - assign notification ke staff
- Fungsi `updateNotificationHandlingByStaff()` - update handling status oleh staff
- Fungsi `addNoteToNotification()` - tambahkan note dari staff

### Di `staff-db.js`:

File terpisah untuk staff CRUD operations:
- `createStaff()` - create new staff
- `getAllStaff()` - get all staff members
- `getStaffById()` - get staff by ID
- `updateStaff()` - update staff info
- `deleteStaff()` - soft delete staff
- `getStaffStats()` - get staff statistics by department

---

## Contoh Query dengan Join

### 1. Get notification dengan staff details populated

```javascript
const {
  getNotificationWithStaffDetails
} = require('./autofix-db');

const notification = await getNotificationWithStaffDetails('notif-123');
console.log(notification);
/*
{
  notificationId: 'notif-123',
  title: 'Error Playing',
  message: 'Channel not responding',
  reportedByStaffId: '507f1f77bcf86cd799439011',
  reportedByStaff: {
    id: '507f1f77bcf86cd799439011',
    name: 'John Doe',
    email: 'john@company.com',
    department: 'IT Support',
    position: 'Technician'
  },
  assignedStaffId: '507f1f77bcf86cd799439012',
  assignedStaff: {
    id: '507f1f77bcf86cd799439012',
    name: 'Jane Smith',
    email: 'jane@company.com',
    department: 'IT Support',
    position: 'Senior Technician'
  }
}
*/
```

### 2. Get staff dengan notification statistics

```javascript
const { getStaffById } = require('./db');

const staff = await getStaffById('507f1f77bcf86cd799439011');
console.log(staff);
/*
{
  _id: '507f1f77bcf86cd799439011',
  name: 'John Doe',
  email: 'john@company.com',
  department: 'IT Support',
  position: 'Technician',
  statistics: {
    reported: 15,
    assigned: 23,
    handled: 18,
    resolved: 16,
    resolutionRate: '88.89%'
  }
}
*/
```

### 3. Get notifications yang dilaporkan/ditangani oleh staff tertentu

```javascript
const { getStaffNotifications } = require('./db');

const notifications = await getStaffNotifications('507f1f77bcf86cd799439011', {
  status: 'resolved',
  limit: 10
});
```

---

## API Endpoints untuk Relasi

### Staff API (`/api/staff`)

- `GET /api/staff` - Get all staff
- `GET /api/staff/:staffId` - Get staff by ID (with notification stats)
- `GET /api/staff/me` - Get current user's staff profile
- `GET /api/staff/stats` - Get staff statistics
- `POST /api/staff` - Create new staff
- `PUT /api/staff/:staffId` - Update staff
- `DELETE /api/staff/:staffId` - Delete staff

### Notification API (perlu ditambahkan)

- `GET /api/notifications` - Get notifications with staff populated
- `GET /api/notifications/:id` - Get notification with staff details
- `POST /api/notifications/:id/assign` - Assign notification to staff
- `POST /api/notifications/:id/notes` - Add note to notification
- `PATCH /api/notifications/:id/status` - Update handling status

---

## Migration Database

Untuk existing database, jalankan query ini:

```javascript
// 1. Add role field to existing users
db.login_page.updateMany(
  { role: { $exists: false } },
  { $set: { role: "guest" } }
);

// 2. Create indexes for staff collection
db.staff.createIndex({ email: 1 }, { unique: true });
db.staff.createIndex({ userId: 1 });
db.staff.createIndex({ department: 1 });
db.staff.createIndex({ isActive: 1 });

// 3. Create indexes for notifications
db.notifications.createIndex({ reportedByStaffId: 1 });
db.notifications.createIndex({ assignedStaffId: 1 });
db.notifications.createIndex({ handledByStaffId: 1 });
db.notifications.createIndex({ reportStatus: 1 });
db.notifications.createIndex({ priority: 1 });
```

---

## Implementasi Checklist

✅ `db.js`:
- [x] Add `staff` collection to connectDB()
- [x] Add `getStaffByUserId()` function
- [x] Add `getStaffById()` with statistics
- [x] Add `getStaffNotifications()` function
- [x] Add `getNotificationsWithStaff()` join function

✅ `autofix-db.js`:
- [x] Add `staff` collection to connectDB()
- [x] Add `getNotificationWithStaffDetails()` function
- [x] Add `getRecentNotificationsWithStaff()` function
- [x] Add `assignNotificationToStaff()` function
- [x] Add `updateNotificationHandlingByStaff()` function
- [x] Add `addNoteToNotification()` function

✅ `staff-db.js`:
- [x] Create separate staff database file
- [x] Implement CRUD operations
- [x] Create indexes

🔄 Next Steps:
- [ ] Create notification API endpoints with staff integration
- [ ] Update existing notification endpoints to use staff details
- [ ] Create reporting API untuk staff performance
- [ ] Frontend integration untuk staff assignment UI

---

## Summary

**Ya, sudah berelasi!**

1. ✅ **staff-db.js** sudah terintegrasi dengan `notifications` collection
2. ✅ **db.js** sudah include staff collection dan fungsi relasi
3. ✅ **autofix-db.js** sudah include staff collection untuk join dengan notifications

Relasi database lengkap antara:
- `login_page` ↔ `staff` (userId link)
- `staff` ↔ `notifications` (staffId fields)
- `notifications` ↔ `auto_fix_logs` (notificationId & staffId fields)

Semua fungsi untuk query dengan join sudah tersedia di `db.js` dan `autofix-db.js`.
