# Project Context: Inventory Management Platform

This document serves as the single source of truth for the **Inventory Management Platform** context, architecture, schema, patterns, and current development state. 

> [!IMPORTANT]
> **Developer Agent Guideline**: 
> - **Always refer to this file first** to understand the application before starting any task.
> - **Update this file** whenever you make database schema changes, implement new endpoints, change core design guidelines, or complete tasks in the backlog. Keep this file updated as a living document!

---

## 1. System Overview & Problem Statement
The application is a full-stack **Inventory Management Platform** designed for high auditability and efficiency. It serves two distinct user roles:
1. **Admins**: Manage products (SKUs), warehouse locations, view dashboard statistics, and inspect the full stock ledger.
2. **Floor Workers**: Access simple interfaces to perform warehouse operations (Receive stock, Pick stock, Cycle Count).

### Core Architectural Pivot: Immutable Stock Ledger
Unlike naive inventory databases that mutate a `quantity` field in a product table, this application employs an **insert-only transaction ledger pattern** (`stock_ledger`):
- Stock is **never updated or deleted** directly.
- Every inventory action (`RECEIVE`, `PICK`, `TRANSFER`, `AUDIT`) is appended as a transactional entry with a signed quantity change (e.g., `+100` for receiving, `-5` for picking).
- Current stock levels for any product are **dynamically aggregated on the fly** by summing the `quantity_change` values in the ledger.
- **Benefits**: Perfect historical audit trail, robust multi-user conflict resolution, simplified offline-first mobile sync (append-only sync queues), and the ability to query historical inventory levels at any arbitrary timestamp.

---

## 2. Tech Stack & Environment
The application is split into three main parts:
- **Backend (FastAPI + PostgreSQL)**: High-performance async API backend using Pydantic, Python-JWT for token authentication, and `psycopg2-binary` for database connectivity.
- **Frontend (React)**: Modern dashboard web client built with React Router, Context API, Tailwind CSS, and `shadcn/ui` components.
- **Mobile (React Native / Expo)**: (Currently planned/placeholder scaffold under `/mobile`) For floor workers utilizing barcode scanning, SQLite local cache, and async offline-to-online sync queues.

### Database Engine
The production and development databases use **PostgreSQL**. A fallback or developer default SQLite structure is documented in older files, but the core implementation in `backend/server.py` relies on `psycopg2` using a `DATABASE_URL` environment variable.

---

## 3. Database Schema Mapping
The PostgreSQL schema consists of four tables. Tables are initialized dynamically on startup in `server.py`:

```mermaid
erDiagram
    users {
        TEXT id PK
        TEXT email UNIQUE
        TEXT password_hash
        TEXT name
        TEXT role
        TEXT created_at
    }
    products {
        TEXT id PK
        TEXT sku UNIQUE
        TEXT name
        TEXT description
        INTEGER low_stock_threshold
        TEXT unit
        TEXT created_at
    }
    locations {
        TEXT id PK
        TEXT warehouse_id
        TEXT zone
        TEXT aisle
        TEXT bin
        INTEGER capacity
        TEXT created_at
    }
    stock_ledger {
        TEXT id PK
        TEXT product_id FK
        TEXT location_id FK
        TEXT user_id FK
        TEXT transaction_type
        INTEGER quantity_change
        TEXT reference_number
        TEXT notes
        TEXT timestamp
    }
    users ||--o{ stock_ledger : "records"
    products ||--o{ stock_ledger : "tracks"
    locations ||--o{ stock_ledger : "at"
```

### Table Details
1. **`users`**: Role-based system users (`admin` or `worker`). Password hashes are generated via `bcrypt` with random salt.
2. **`products`**: Identifies items using a unique **SKU**. Custom low-stock thresholds are configured per-item.
3. **`locations`**: Warehouse storage cells categorized using a hierarchical model:
   $$\text{Warehouse} \rightarrow \text{Zone} \rightarrow \text{Aisle} \rightarrow \text{Bin}$$
   *(Example: `WH1` $\rightarrow$ `A` $\rightarrow$ `1` $\rightarrow$ `01` yields path `WH1-A-1-01`)*
4. **`stock_ledger`**: The immutable transaction table. Contains foreign keys to `products`, `locations`, and `users`.
   - **Indexes**: 
     - `idx_stock_product` on `product_id` (accelerates on-the-fly stock aggregation queries)
     - `idx_stock_timestamp` on `timestamp` (accelerates timeline queries and sync delta pulls)

---

## 4. Key Design System (Swiss High-Contrast)
The UI features a premium, modern aesthetic styled after **Swiss High-Contrast Grid Design**:
- **Typography**: 
  - Headings: `Cabinet Grotesk` (bold, tight tracking).
  - Body: `IBM Plex Sans` (sleek, legible).
  - System elements (SKUs, counts, logs): `JetBrains Mono`.
- **Colors**:
  - Base: Monochrome (Pure white `#FFFFFF`, off-white `#F4F4F6`, dark slate `#0A0A0A`).
  - Brand Primary Accent: International Klein Blue (`#002FA7`) for selected items, primary CTAs, active states.
  - Brand Alert Accent: Red (`#FF3B30`) for low-stock items or danger states.
- **Borders & Shadows**:
  - Sharp 1px borders.
  - Strictly no shadows or soft blurs to maintain Swiss structural precision.

---

## 5. Folder Structure Reference
The repository layout is organized as follows:

```
inventoryTracker/
├── backend/                       # FastAPI Server
│   ├── api/                       # Vercel serverless entrypoint router
│   │   └── index.py               # Imports app from server.py
│   ├── tests/
│   │   └── backend_test.py        # Comprehensive test coverage (35+ cases)
│   ├── .env                       # Local environment configurations
│   ├── server.py                  # Main backend server (auth, products, locations, ledger, sync)
│   └── requirements.txt           # Python dependency specifications
├── frontend/                      # React SPA Web Dashboard
│   ├── public/                    # Standard HTML template, manifest, icons
│   ├── src/
│   │   ├── components/            # UI components (shadcn/ui, grids)
│   │   ├── contexts/              # Global state (AuthContext.js)
│   │   ├── pages/                 # Routing endpoints (Dashboard, Products, Locations, Ledger, Worker)
│   │   ├── index.css              # Custom Swiss-style typography & utility injections
│   │   └── App.js                 # App configuration & route guards
│   ├── craco.config.js            # Build modifications for shadcn/Tailwind
│   └── vercel.json                # Vercel deployment directives
├── mobile/                        # React Native Expo Mobile client
│   ├── App.js                     # Interim worker loading screen / router
│   └── README.md                  # Development path, SQLite schema, and sync flow design
├── memory/                        # Core requirements & static references
│   └── PRD.md                     # Project requirements & initial backlog status
└── docs/                          # User walkthrough guide, screenshots, and visual guides
```

---

## 6. Key API Endpoints

### Authentication
- `POST /api/auth/register` - Register a user (Worker/Admin). Returns JWT token.
- `POST /api/auth/login` - Authenticate user credentials. Sets JWT token in `httpOnly` secure cookie.
- `POST /api/auth/logout` - Revokes session by clearing cookies.
- `GET /api/auth/me` - Resolves active session data for user object.

### Product Management
- `GET /api/products` - Returns product list. Admin and worker authorized. Aggregates `current_stock` dynamically.
- `POST /api/products` - Add a new SKU (Admin Only).
- `PUT /api/products/{id}` - Modify existing SKU (Admin Only).
- `DELETE /api/products/{id}` - Remove SKU (Admin Only).

### Location Management
- `GET /api/locations` - Lists storage locations.
- `POST /api/locations` - Add a new bin location (Admin Only).
- `PUT /api/locations/{id}` - Modify storage capacity or path details (Admin Only).
- `DELETE /api/locations/{id}` - Delete storage location (Admin Only).

### Stock Ledger & Transactions
- `POST /api/stock/transaction` - Create a single ledger entry (`RECEIVE`, `PICK`, `TRANSFER`, `AUDIT`).
- `GET /api/stock/ledger` - List all ledger entries chronologically.
- `GET /api/stock/product/{product_id}` - Fetch ledger log history filtered for a specific SKU.

### Mobile Offline Sync
- `POST /api/sync/push` - Receive a queued list of transaction rows compiled offline by mobile clients.
- `GET /api/sync/pull` - Retrieve transaction logs committed since worker's last connection timestamp.

---

## 7. Configuration & Local Execution

### Backend
1. Initialize `.env` from `env.example`.
2. Install pip dependencies:
   ```bash
   cd backend
   pip install -r requirements.txt
   ```
3. Set `DATABASE_URL` for PostgreSQL. For local testing, ensure a local Postgres instance is running or mock/configure a sqlite database connection if doing light local edits.
4. Launch hot-reloading server:
   ```bash
   uvicorn server:app --reload --host 127.0.0.1 --port 8000
   ```

### Frontend
1. Initialize `.env.local` from `env.example`. Ensure `REACT_APP_BACKEND_URL` targets the correct port (`http://localhost:8000`).
2. Install packages:
   ```bash
   cd frontend
   npm install
   ```
3. Launch development server:
   ```bash
   npm start
   ```

### Automated Testing
Run the backend tests using `pytest` to guarantee APIs behave as expected:
```bash
cd backend
pytest -v tests/backend_test.py
```

---

## 8. Development Backlog (PRD Tracking)

### P0 (Completed ✅)
- [x] Initialize the React Native Expo app under `mobile/` with full directory structures.
- [x] Incorporate `expo-camera` (using modern `<CameraView>`) for barcode scanning and manual input fallback.
- [x] Set up local SQLite instance cache (`products_cache`, `locations_cache`, `pending_transactions`) using `expo-sqlite`.
- [x] Build robust sync services for transaction syncing via `/api/sync/push` and master pulling.

### P1 (Dashboard & Administration Enhancements)
- [ ] Time-series velocity visualization (Recharts charting transaction flows on dashboard).
- [ ] Specialized product view screen displaying per-SKU detailed timeline of movements.
- [ ] Bulk file SKU import & ledger export options (CSV formatting).

### P2 (Security & Refactor Tasks)
- [ ] Implement rate-limiting or brute-force lockout (5 attempts triggers 15 minutes lockout) on login endpoints.
- [ ] Refactor monolithic `server.py` routes out into neat domain packages (`routes/auth.py`, `routes/products.py`, etc.).
- [ ] Standardize API response payloads using uniform strict schema handlers.
