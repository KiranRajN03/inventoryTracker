# Inventory Management Mobile App

## React Native / Expo Mobile App for Warehouse Floor Workers

### Features
- Barcode scanning (camera + keyboard input)
- Receive Stock flow
- Pick Stock flow
- Cycle Counting flow
- Offline-first with SQLite
- Sync queue mechanism

### Technology Stack
- React Native / Expo
- react-native-camera (barcode detection)
- SQLite for offline storage
- AsyncStorage for sync queue

### Setup Instructions

1. Install Expo CLI:
```bash
npm install -g expo-cli
```

2. Initialize Expo project:
```bash
cd /app/mobile
expo init InventoryMobile
cd InventoryMobile
```

3. Install dependencies:
```bash
expo install expo-camera expo-barcode-scanner
expo install expo-sqlite
npm install axios
```

4. Configure API endpoint in .env or constants

5. Run the app:
```bash
expo start
```

### Folder Structure
```
/app/mobile/InventoryMobile/
├── App.js
├── src/
│   ├── screens/
│   │   ├── LoginScreen.js
│   │   ├── HomeScreen.js
│   │   ├── ReceiveStockScreen.js
│   │   ├── PickStockScreen.js
│   │   └── CycleCountScreen.js
│   ├── components/
│   │   ├── BarcodeScanner.js
│   │   └── OfflineIndicator.js
│   ├── utils/
│   │   ├── database.js
│   │   ├── syncQueue.js
│   │   └── api.js
│   └── contexts/
│       └── AuthContext.js
```

### Key Implementation Notes

#### Barcode Scanner Component
- Uses react-native-camera with barcode detection
- Fallback to manual keyboard input
- Large tap targets (min 64px height)
- High-contrast framing reticle

#### Offline Storage
- SQLite database for local product/location cache
- Transaction queue stored in SQLite
- Sync on network availability

#### Transaction Flow
1. Worker scans barcode (or types SKU)
2. App looks up product in local SQLite
3. Worker selects location
4. Worker enters quantity
5. Transaction saved to local queue
6. Auto-sync when online

#### Sync Queue
- Transactions stored with `synced: false` flag
- Background sync process polls API
- On success, mark transaction as `synced: true`
- Handle conflicts (show user, manual resolution)

### API Endpoints Used
- POST /api/auth/login
- GET /api/auth/me
- GET /api/products (for local cache)
- GET /api/locations (for local cache)
- POST /api/sync/push (bulk transaction upload)
- GET /api/sync/pull (fetch recent server changes)

### UI Design Guidelines
- Swiss high-contrast design
- Cabinet Grotesk font for headings
- IBM Plex Sans for body
- Monochrome base (#F4F4F6, #FFFFFF, #0A0A0A)
- Primary action: #002FA7
- Alert: #FF3B30
- Warning: #FFCC00 (offline indicator)
- Success: #34C759
- Large tap targets (min-h-[64px])
- Bottom tab navigation
- Floating scanner action button

### Security
- JWT tokens stored in secure storage
- API calls with Authorization header
- HTTPS only in production

### Testing
- Test offline mode by disabling network
- Test barcode scanner with sample barcodes
- Test sync queue after reconnection

---

**Note**: This is a placeholder for the full mobile app implementation. The React Native app requires a separate Expo setup and cannot run in the current FastAPI/React web environment.
