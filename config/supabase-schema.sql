-- SQL Schema untuk Supabase (PostgreSQL)
-- Jalankan query ini di Supabase SQL Editor untuk setup database

-- 1. International Channels Table
CREATE TABLE IF NOT EXISTS international_channels (
  id TEXT PRIMARY KEY,
  channelName TEXT,
  slug TEXT UNIQUE,
  url TEXT,
  category TEXT,
  genre TEXT,
  language TEXT,
  status TEXT DEFAULT 'active',
  region TEXT,
  quality TEXT,
  resolution TEXT,
  bitrate INTEGER,
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP,
  synced_at TIMESTAMP DEFAULT NOW(),
  collection_name TEXT DEFAULT 'international_channels'
);

-- 2. Local Channels Table
CREATE TABLE IF NOT EXISTS local_channels (
  id TEXT PRIMARY KEY,
  channelName TEXT,
  slug TEXT UNIQUE,
  url TEXT,
  category TEXT,
  genre TEXT,
  language TEXT,
  status TEXT DEFAULT 'active',
  region TEXT,
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP,
  synced_at TIMESTAMP DEFAULT NOW(),
  collection_name TEXT DEFAULT 'local_channels'
);

-- 3. Hospitality TV Table
CREATE TABLE IF NOT EXISTS tv_hospitality (
  id TEXT PRIMARY KEY,
  roomNo TEXT UNIQUE,
  hotelName TEXT,
  floor TEXT,
  tvModel TEXT,
  ipAddress TEXT,
  macAddress TEXT,
  status TEXT,
  signalQuality INTEGER,
  responseTime INTEGER,
  lastUpdated TIMESTAMP,
  createdAt TIMESTAMP,
  synced_at TIMESTAMP DEFAULT NOW(),
  collection_name TEXT DEFAULT 'tv_hospitality'
);

-- 4. Users Table (Login Page)
CREATE TABLE IF NOT EXISTS login_page (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT,
  name TEXT,
  avatar TEXT,
  role TEXT DEFAULT 'guest',
  provider TEXT DEFAULT 'local',
  googleId TEXT,
  isActive BOOLEAN DEFAULT true,
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP,
  synced_at TIMESTAMP DEFAULT NOW(),
  collection_name TEXT DEFAULT 'login_page'
);

-- 5. Chromecast Devices Table
CREATE TABLE IF NOT EXISTS chromecast (
  id TEXT PRIMARY KEY,
  deviceName TEXT UNIQUE,
  deviceId TEXT UNIQUE,
  ipAddress TEXT,
  macAddress TEXT,
  location TEXT,
  status TEXT,
  signalLevel INTEGER,
  wifiSpeed INTEGER,
  responseTime INTEGER,
  model TEXT,
  firmwareVersion TEXT,
  lastUpdated TIMESTAMP,
  createdAt TIMESTAMP,
  synced_at TIMESTAMP DEFAULT NOW(),
  collection_name TEXT DEFAULT 'chromecast'
);

-- 6. Auto Fix History Table
CREATE TABLE IF NOT EXISTS auto_fix_history (
  id TEXT PRIMARY KEY,
  deviceId TEXT,
  deviceName TEXT,
  issueType TEXT,
  category TEXT,
  description TEXT,
  status TEXT,
  resolution TEXT,
  severity TEXT,
  autoResolved BOOLEAN,
  resolutionTime INTEGER,
  createdAt TIMESTAMP,
  resolvedAt TIMESTAMP,
  synced_at TIMESTAMP DEFAULT NOW(),
  collection_name TEXT DEFAULT 'auto_fix_history'
);

-- 7. Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  channelId TEXT,
  channelName TEXT,
  issue TEXT,
  category TEXT,
  severity TEXT,
  status TEXT,
  assignedStaffId TEXT,
  resolvedBy TEXT,
  description TEXT,
  createdAt TIMESTAMP,
  resolvedAt TIMESTAMP,
  estimatedResolutionTime INTEGER,
  synced_at TIMESTAMP DEFAULT NOW(),
  collection_name TEXT DEFAULT 'notifications'
);

-- 8. Staff Table
CREATE TABLE IF NOT EXISTS staff (
  id TEXT PRIMARY KEY,
  userId TEXT,
  username TEXT,
  email TEXT,
  department TEXT,
  role TEXT,
  phone TEXT,
  status TEXT DEFAULT 'active',
  assignedAreas TEXT[], -- Array of areas
  notificationsHandled INTEGER DEFAULT 0,
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP,
  synced_at TIMESTAMP DEFAULT NOW(),
  collection_name TEXT DEFAULT 'staff'
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_international_channels_status ON international_channels(status);
CREATE INDEX IF NOT EXISTS idx_international_channels_category ON international_channels(category);
CREATE INDEX IF NOT EXISTS idx_local_channels_status ON local_channels(status);
CREATE INDEX IF NOT EXISTS idx_tv_hospitality_status ON tv_hospitality(status);
CREATE INDEX IF NOT EXISTS idx_tv_hospitality_roomNo ON tv_hospitality(roomNo);
CREATE INDEX IF NOT EXISTS idx_chromecast_status ON chromecast(status);
CREATE INDEX IF NOT EXISTS idx_login_page_email ON login_page(email);
CREATE INDEX IF NOT EXISTS idx_login_page_username ON login_page(username);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_category ON notifications(category);
CREATE INDEX IF NOT EXISTS idx_notifications_assignedStaffId ON notifications(assignedStaffId);
CREATE INDEX IF NOT EXISTS idx_auto_fix_history_status ON auto_fix_history(status);
CREATE INDEX IF NOT EXISTS idx_auto_fix_history_category ON auto_fix_history(category);

-- Enable Row Level Security (RLS) untuk security
ALTER TABLE international_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE tv_hospitality ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_page ENABLE ROW LEVEL SECURITY;
ALTER TABLE chromecast ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_fix_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (disable for now - enable in production)
-- DROP POLICY IF EXISTS "Enable read for authenticated" ON international_channels;
-- CREATE POLICY "Enable read for authenticated" ON international_channels
-- FOR SELECT USING (auth.role() = 'authenticated');

-- 9. Backup Status Table
CREATE TABLE IF NOT EXISTS backup_status (
  id SERIAL PRIMARY KEY,
  collection_name TEXT,
  last_sync TIMESTAMP DEFAULT NOW(),
  sync_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active'
);

-- Add trigger to auto-update backup_status
CREATE OR REPLACE FUNCTION update_backup_status()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO backup_status (collection_name, last_sync, sync_count, status)
  VALUES (NEW.collection_name, NOW(), 1, 'active')
  ON CONFLICT (collection_name) DO UPDATE SET
    last_sync = NOW(),
    sync_count = backup_status.sync_count + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to all tables (optional - uncomment as needed)
-- CREATE TRIGGER international_channels_backup_trigger
-- AFTER INSERT OR UPDATE ON international_channels
-- FOR EACH ROW EXECUTE FUNCTION update_backup_status();
