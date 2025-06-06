const { MongoClient } = require('mongodb');

// MongoDB connection string
const mongoUri = 'mongodb+srv://mekd1bro:727PlayingCards@cluster0.wnmnw.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const dbName = 'iptv';
const collectionName = 'tv_hospitality';

// Data array dari CSV mapping_20250529.csv
const tvHospitalityData = [
  { id: 1, roomNo: "701", ipAddress: "192.168.9.89", macAddress: "d8-e0-e1-4e-b1-26", tvType: "2016", firmwareVer: null, tvModel: null, softapID: null, softapKey: null },
  { id: 2, roomNo: "812", ipAddress: "192.168.9.118", macAddress: "44-5c-e9-50-2a-aa", tvType: "2016", firmwareVer: null, tvModel: null, softapID: null, softapKey: null },
  { id: 3, roomNo: "813", ipAddress: "192.168.9.119", macAddress: "a4-30-7a-a3-fe-e4", tvType: "2016", firmwareVer: null, tvModel: null, softapID: null, softapKey: null },
  { id: 4, roomNo: "727", ipAddress: "192.168.9.106", macAddress: "f8-3f-51-06-6a-90", tvType: "2016", firmwareVer: null, tvModel: null, softapID: null, softapKey: null },
  { id: 5, roomNo: "623", ipAddress: "192.168.9.81", macAddress: "f8-3f-51-06-65-e6", tvType: "2016", firmwareVer: null, tvModel: null, softapID: null, softapKey: null },
  { id: 6, roomNo: "116", ipAddress: "192.168.9.15", macAddress: "d8-e0-e1-4e-b1-3c", tvType: "2016", firmwareVer: null, tvModel: null, softapID: null, softapKey: null },
  { id: 7, roomNo: "125", ipAddress: "192.168.9.20", macAddress: "5c-49-7d-60-0c-d2", tvType: "2016", firmwareVer: null, tvModel: null, softapID: null, softapKey: null },
  { id: 8, roomNo: "826a", ipAddress: "192.168.9.126", macAddress: "f8-3f-51-06-6a-80", tvType: "2016", firmwareVer: null, tvModel: null, softapID: null, softapKey: null },
  { id: 9, roomNo: "315", ipAddress: "192.168.9.44", macAddress: "d8-e0-e1-4e-ad-a3", tvType: "2016", firmwareVer: null, tvModel: null, softapID: null, softapKey: null },
  { id: 10, roomNo: "127", ipAddress: "192.168.9.22", macAddress: "f8-3f-51-06-59-36", tvType: "2016", firmwareVer: null, tvModel: null, softapID: null, softapKey: null },
  { id: 11, roomNo: "126", ipAddress: "192.168.9.21", macAddress: "f8-3f-51-06-58-b6", tvType: "2016", firmwareVer: null, tvModel: null, softapID: null, softapKey: null },
  { id: 12, roomNo: "815", ipAddress: "192.168.9.120", macAddress: "28-39-5e-ba-6c-94", tvType: "2016", firmwareVer: null, tvModel: null, softapID: null, softapKey: null },
  { id: 13, roomNo: "533", ipAddress: "192.168.9.70", macAddress: "d8-e0-e1-4e-ad-58", tvType: "2016", firmwareVer: null, tvModel: null, softapID: null, softapKey: null },
  { id: 14, roomNo: "702", ipAddress: "192.168.9.90", macAddress: "d8-e0-e1-4d-e1-2c", tvType: "2016", firmwareVer: null, tvModel: null, softapID: null, softapKey: null },
  { id: 15, roomNo: "612", ipAddress: "192.168.9.74", macAddress: "d8-e0-e1-4e-b1-3b", tvType: "2016", firmwareVer: null, tvModel: null, softapID: null, softapKey: null },
  { id: 16, roomNo: "826b", ipAddress: "192.168.9.127", macAddress: "d8-e0-e1-4d-e1-30", tvType: "2016", firmwareVer: null, tvModel: null, softapID: null, softapKey: null },
  { id: 17, roomNo: "715", ipAddress: "192.168.9.98", macAddress: "f8-3f-51-06-5f-54", tvType: "2016", firmwareVer: null, tvModel: null, softapID: null, softapKey: null },
  { id: 18, roomNo: "235", ipAddress: "192.168.9.41", macAddress: "d8-e0-e1-4d-e1-51", tvType: "2016", firmwareVer: null, tvModel: null, softapID: null, softapKey: null },
  { id: 19, roomNo: "807", ipAddress: "192.168.9.116", macAddress: "a4-30-7a-a3-fe-dc", tvType: "2016", firmwareVer: null, tvModel: null, softapID: null, softapKey: null },
  { id: 20, roomNo: "613", ipAddress: "192.168.9.75", macAddress: "28-39-5e-ba-6c-76", tvType: "2016", firmwareVer: null, tvModel: null, softapID: null, softapKey: null },
  { id: 21, roomNo: "123", ipAddress: "192.168.9.19", macAddress: "5c-49-7d-d9-58-27", tvType: "2016", firmwareVer: null, tvModel: null, softapID: null, softapKey: null },
  { id: 22, roomNo: "113", ipAddress: "192.168.9.13", macAddress: "d8-e0-e1-4d-e1-44", tvType: "2016", firmwareVer: null, tvModel: null, softapID: null, softapKey: null },
  { id: 23, roomNo: "803", ipAddress: "192.168.9.113", macAddress: "d8-e0-e1-4d-e1-2a", tvType: "2016", firmwareVer: null, tvModel: null, softapID: null, softapKey: null },
  { id: 24, roomNo: "713", ipAddress: "192.168.9.97", macAddress: "64-1c-b0-ce-75-3d", tvType: "2016", firmwareVer: null, tvModel: null, softapID: null, softapKey: null },
  { id: 25, roomNo: "622", ipAddress: "192.168.9.152", macAddress: "f8-3f-51-06-70-35", tvType: "2016", firmwareVer: null, tvModel: null, softapID: null, softapKey: null },
  { id: 26, roomNo: "621", ipAddress: "192.168.9.79", macAddress: "f8-3f-51-06-6a-50", tvType: "2016", firmwareVer: null, tvModel: null, softapID: null, softapKey: null },
  { id: 27, roomNo: "626", ipAddress: "192.168.9.83", macAddress: "f8-3f-51-06-58-a7", tvType: "2016", firmwareVer: null, tvModel: null, softapID: null, softapKey: null },
  { id: 28, roomNo: "512", ipAddress: "192.168.9.58", macAddress: "d8-e0-e1-4e-ad-7c", tvType: "2016", firmwareVer: null, tvModel: null, softapID: null, softapKey: null },
  { id: 29, roomNo: "102", ipAddress: "192.168.9.6", macAddress: "f8-3f-51-06-5e-f0", tvType: "2016", firmwareVer: null, tvModel: null, softapID: null, softapKey: null },
  { id: 30, roomNo: "107", ipAddress: "192.168.9.10", macAddress: "d8-e0-e1-4d-e1-1f", tvType: "2016", firmwareVer: null, tvModel: null, softapID: null, softapKey: null },
  { id: 31, roomNo: "112", ipAddress: "192.168.9.12", macAddress: "f8-3f-51-06-59-35", tvType: "2016", firmwareVer: null, tvModel: null, softapID: null, softapKey: null },
  { id: 32, roomNo: "517", ipAddress: "192.168.9.62", macAddress: "f8-3f-51-06-59-4d", tvType: "2016", firmwareVer: null, tvModel: null, softapID: null, softapKey: null },
  { id: 33, roomNo: "611", ipAddress: "192.168.9.73", macAddress: "f8-3f-51-06-5f-9f", tvType: "2016", firmwareVer: null, tvModel: null, softapID: null, softapKey: null },
  { id: 34, roomNo: "101", ipAddress: "192.168.9.5", macAddress: "64-1c-b0-66-cc-02", tvType: "2016", firmwareVer: null, tvModel: null, softapID: null, softapKey: null },
  { id: 35, roomNo: "832b", ipAddress: "192.168.9.139", macAddress: "04-b9-e3-c9-e6-ac", tvType: "2014", firmwareVer: "T-KTM2UABCB-1330.0", tvModel: null, softapID: null, softapKey: null },
  { id: 36, roomNo: "535n", ipAddress: "192.168.9.71", macAddress: "d8-e0-e1-4e-ad-43", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 37, roomNo: "802", ipAddress: "192.168.9.112", macAddress: "d8-e0-e1-4e-b5-af", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1040.0", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 38, roomNo: "806", ipAddress: "192.168.9.115", macAddress: "d8-e0-e1-4e-b5-ac", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 39, roomNo: "703", ipAddress: "192.168.9.91", macAddress: "d8-e0-e1-4d-db-eb", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 40, roomNo: "133", ipAddress: "192.168.9.24", macAddress: "7c-64-56-66-e6-8a", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1040.0", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 41, roomNo: "511", ipAddress: "192.168.9.57", macAddress: "f8-3f-51-06-5e-f3", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 42, roomNo: "801", ipAddress: "192.168.9.111", macAddress: "f8-3f-51-04-c9-ba", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1015.0", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 43, roomNo: "212", ipAddress: "192.168.9.28", macAddress: "f8-3f-51-06-5f-75", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 44, roomNo: "138b", ipAddress: "192.168.9.26", macAddress: "64-1c-b0-65-8e-ef", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1040.0", tvModel: null, softapID: null, softapKey: null },
  { id: 45, roomNo: "138a", ipAddress: "192.168.9.25", macAddress: "64-1c-b0-66-cc-4b", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1040.0", tvModel: null, softapID: null, softapKey: null },
  { id: 46, roomNo: "316b", ipAddress: "192.168.9.137", macAddress: "d8-e0-e1-4e-b1-39", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1040.0", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 47, roomNo: "215", ipAddress: "192.168.9.30", macAddress: "f8-3f-51-06-5f-2a", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 48, roomNo: "105", ipAddress: "192.168.9.8", macAddress: "f8-3f-51-e5-3a-79", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 49, roomNo: "103", ipAddress: "192.168.9.7", macAddress: "d8-e0-e1-4d-e1-1c", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 50, roomNo: "121", ipAddress: "192.168.9.17", macAddress: "f8-3f-51-06-6a-69", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 51, roomNo: "122", ipAddress: "192.168.9.18", macAddress: "d8-e0-e1-4d-e1-34", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 52, roomNo: "117", ipAddress: "192.168.9.16", macAddress: "d8-e0-e1-4d-e1-46", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 53, roomNo: "115", ipAddress: "192.168.9.14", macAddress: "d8-e0-e1-4d-e1-1e", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1040.0", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 54, roomNo: "111", ipAddress: "192.168.9.11", macAddress: "d8-e0-e1-4d-e1-3a", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1040.0", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 55, roomNo: "217", ipAddress: "192.168.9.32", macAddress: "f8-3f-51-06-5f-76", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 56, roomNo: "216", ipAddress: "192.168.9.31", macAddress: "f8-3f-51-06-65-e7", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 57, roomNo: "106", ipAddress: "192.168.9.9", macAddress: "f8-3f-51-06-59-3a", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 58, roomNo: "211", ipAddress: "192.168.9.27", macAddress: "f8-3f-51-06-6a-92", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 59, roomNo: "227", ipAddress: "192.168.9.38", macAddress: "f8-3f-51-06-6a-71", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 60, roomNo: "735", ipAddress: "192.168.9.109", macAddress: "d8-e0-e1-4e-b1-a6", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 61, roomNo: "225", ipAddress: "192.168.9.36", macAddress: "f8-3f-51-06-59-52", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1040.0", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 62, roomNo: "223", ipAddress: "192.168.9.35", macAddress: "f8-3f-51-e5-3b-21", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 63, roomNo: "222", ipAddress: "192.168.9.34", macAddress: "f8-3f-51-06-70-46", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 64, roomNo: "221", ipAddress: "192.168.9.33", macAddress: "f8-3f-51-06-59-30", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 65, roomNo: "335", ipAddress: "192.168.9.55", macAddress: "f8-3f-51-06-6a-62", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 66, roomNo: "132", ipAddress: "192.168.9.23", macAddress: "d8-e0-e1-4e-b1-24", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 67, roomNo: "236", ipAddress: "192.168.9.42", macAddress: "f8-3f-51-06-59-2b", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 68, roomNo: "233", ipAddress: "192.168.9.40", macAddress: "f8-3f-51-06-59-56", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 69, roomNo: "232", ipAddress: "192.168.9.39", macAddress: "f8-3f-51-06-5f-02", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 70, roomNo: "336", ipAddress: "192.168.9.56", macAddress: "f8-3f-51-06-5f-6f", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 71, roomNo: "333", ipAddress: "192.168.9.54", macAddress: "28-39-5e-ba-6c-92", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1040.0", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 72, roomNo: "332", ipAddress: "192.168.9.53", macAddress: "f8-3f-51-06-5e-f5", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 73, roomNo: "326", ipAddress: "192.168.9.51", macAddress: "d8-e0-e1-4e-b1-69", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 74, roomNo: "325", ipAddress: "192.168.9.50", macAddress: "d8-e0-e1-4d-dc-00", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 75, roomNo: "323", ipAddress: "192.168.9.49", macAddress: "f8-3f-51-06-58-b5", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 76, roomNo: "322", ipAddress: "192.168.9.48", macAddress: "d8-e0-e1-4d-e1-3d", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 77, roomNo: "316a", ipAddress: "192.168.9.45", macAddress: "f8-3f-51-06-6a-87", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1040.0", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 78, roomNo: "733", ipAddress: "192.168.9.108", macAddress: "d8-e0-e1-4e-ad-a5", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 79, roomNo: "636", ipAddress: "192.168.9.88", macAddress: "f8-3f-51-06-70-18", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 80, roomNo: "635", ipAddress: "192.168.9.87", macAddress: "f8-3f-51-06-6a-77", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 81, roomNo: "633", ipAddress: "192.168.9.86", macAddress: "d8-e0-e1-4e-ad-49", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1040.0", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 82, roomNo: "616", ipAddress: "192.168.9.77", macAddress: "d8-e0-e1-4d-db-ee", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1040.0", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 83, roomNo: "617", ipAddress: "192.168.9.78", macAddress: "f8-3f-51-06-59-48", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1040.0", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 84, roomNo: "615", ipAddress: "192.168.9.76", macAddress: "f8-3f-51-06-59-4f", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 85, roomNo: "515", ipAddress: "192.168.9.60", macAddress: "d8-e0-e1-4d-e1-4e", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 86, roomNo: "516", ipAddress: "192.168.9.61", macAddress: "d8-e0-e1-4d-db-fd", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1040.0", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 87, roomNo: "513", ipAddress: "192.168.9.59", macAddress: "28-39-5e-ba-6c-da", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1040.0", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 88, roomNo: "527", ipAddress: "192.168.9.68", macAddress: "f8-3f-51-e5-3b-30", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 89, roomNo: "526", ipAddress: "192.168.9.67", macAddress: "28-39-5e-ba-6c-6c", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1040.0", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 90, roomNo: "523", ipAddress: "192.168.9.65", macAddress: "d8-e0-e1-4e-b1-8a", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: "Samsung 6 Series (49)", softapKey: "wp0fn3zq" },
  { id: 91, roomNo: "532", ipAddress: "192.168.9.69", macAddress: "d8-e0-e1-4e-b1-67", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 92, roomNo: "213", ipAddress: "192.168.9.29", macAddress: "f8-3f-51-06-59-4e", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1040.0", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 93, roomNo: "625", ipAddress: "192.168.9.82", macAddress: "28-39-5e-ba-6c-96", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1040.0", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 94, roomNo: "627", ipAddress: "192.168.9.84", macAddress: "f8-3f-51-e5-3b-32", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 95, roomNo: "838a", ipAddress: "192.168.9.131", macAddress: "d8-e0-e1-4e-b1-14", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1040.0", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 96, roomNo: "717", ipAddress: "192.168.9.100", macAddress: "f8-3f-51-06-59-41", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 97, roomNo: "725", ipAddress: "192.168.9.104", macAddress: "f8-3f-51-06-6a-67", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1040.0", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 98, roomNo: "736", ipAddress: "192.168.9.110", macAddress: "f8-3f-51-06-5e-ef", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: "Room 736", softapKey: "019eggaz" },
  { id: 99, roomNo: "536", ipAddress: "192.168.9.72", macAddress: "28-39-5e-ba-6c-6e", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1040.0", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 100, roomNo: "827", ipAddress: "192.168.9.128", macAddress: "d8-e0-e1-4d-e1-1d", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1040.0", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 101, roomNo: "823", ipAddress: "192.168.9.125", macAddress: "d8-e0-e1-4e-b1-37", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1040.0", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 102, roomNo: "327", ipAddress: "192.168.9.52", macAddress: "f8-3f-51-06-59-3f", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 103, roomNo: "822", ipAddress: "192.168.9.124", macAddress: "d8-e0-e1-4e-ad-59", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1040.0", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 104, roomNo: "722", ipAddress: "192.168.9.102", macAddress: "f8-3f-51-e5-3b-33", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 105, roomNo: "721", ipAddress: "192.168.9.101", macAddress: "f8-3f-51-06-59-47", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 106, roomNo: "521", ipAddress: "192.168.9.63", macAddress: "f8-3f-51-06-5e-fc", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 107, roomNo: "226", ipAddress: "192.168.9.37", macAddress: "f8-3f-51-06-70-0c", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 108, roomNo: "732", ipAddress: "192.168.9.107", macAddress: "d8-e0-e1-4d-dc-01", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 109, roomNo: "726", ipAddress: "192.168.9.105", macAddress: "d8-e0-e1-4e-b5-a5", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 110, roomNo: "723", ipAddress: "192.168.9.103", macAddress: "28-39-5e-ba-6c-6d", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1040.0", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 111, roomNo: "821", ipAddress: "192.168.9.123", macAddress: "f8-3f-51-06-59-55", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1040.0", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 112, roomNo: "525", ipAddress: "192.168.9.66", macAddress: "d8-e0-e1-4e-b1-7e", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 113, roomNo: "816", ipAddress: "192.168.9.121", macAddress: "f8-3f-51-06-6a-46", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 114, roomNo: "838b", ipAddress: "192.168.9.132", macAddress: "d8-e0-e1-4e-b5-a9", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1040.0", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 115, roomNo: "811", ipAddress: "192.168.9.117", macAddress: "f8-3f-51-06-59-54", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 116, roomNo: "832a", ipAddress: "192.168.9.129", macAddress: "d8-e0-e1-4e-ad-47", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1040.0", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 117, roomNo: "522", ipAddress: "192.168.9.64", macAddress: "d8-e0-e1-4e-b1-6e", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1040.0", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 118, roomNo: "817", ipAddress: "192.168.9.122", macAddress: "d8-e0-e1-4d-dc-13", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1040.0", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 119, roomNo: "716", ipAddress: "192.168.9.99", macAddress: "f8-3f-51-06-6a-6d", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1040.0", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 120, roomNo: "712", ipAddress: "192.168.9.96", macAddress: "f8-3f-51-06-5f-3d", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1040.0", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 121, roomNo: "711", ipAddress: "192.168.9.95", macAddress: "f8-3f-51-06-6a-7b", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 122, roomNo: "705", ipAddress: "192.168.9.92", macAddress: "f8-3f-51-06-59-57", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1040.0", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 123, roomNo: "706", ipAddress: "192.168.9.93", macAddress: "f8-3f-51-04-c9-cb", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1015.0", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 124, roomNo: "707", ipAddress: "192.168.9.94", macAddress: "f8-3f-51-e5-3a-74", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1016.3", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 125, roomNo: "632", ipAddress: "192.168.9.85", macAddress: "d8-e0-e1-4e-b1-32", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1040.0", tvModel: "HG49AE690", softapID: null, softapKey: null },
  { id: 126, roomNo: "805", ipAddress: "192.168.9.114", macAddress: "f8-3f-51-06-6a-70", tvType: "2016", firmwareVer: "T-M14HKDEUCB-1040.0", tvModel: "HG49AE690", softapID: null, softapKey: null }
];

async function connectDB() {
  try {
    const client = new MongoClient(mongoUri);
    await client.connect();
    console.log('Connected to MongoDB Atlas');

    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    return { client, db, collection };
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    throw error;
  }
}

async function seed() {
  let client;

  try {
    const { client: dbClient, collection } = await connectDB();
    client = dbClient;

    // Clear existing data
    console.log('Clearing existing data...');
    await collection.deleteMany({});

    // Insert new data
    if (tvHospitalityData.length > 0) {
      console.log('Inserting new data...');
      const result = await collection.insertMany(tvHospitalityData);
      console.log(`${result.insertedCount} documents inserted successfully`);
    }

    console.log('Data berhasil di-seed ke MongoDB Atlas');
    console.log(`Database: ${dbName}`);
    console.log(`Collection: ${collectionName}`);

  } catch (error) {
    console.error('Error seeding data:', error);
  } finally {
    if (client) {
      await client.close();
      console.log('Database connection closed');
    }
    process.exit(0);
  }
}

// Run the seed function
seed();