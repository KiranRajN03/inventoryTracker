# Project Context: Inventory Management Platform

This document serves as the single source of truth for the **Inventory Management Platform** context, architecture, schema, patterns, and development guidelines.

---

## 1. System Overview & Core Purpose
The application is a full-stack **Inventory Control & Management Platform** tailored for shop owners who want to track their warehouse and floor inventory with absolute accuracy and auditable history.

### Key Business Constraints
* **Standalone Ownership**: The application is designed for independent shops/warehouses. Each shop owner hosts/owns their instance.
* **Concurrent Logins**: Up to **5 concurrent sessions** are supported per user account using the same credentials at any given point (ideal for small operations where multiple workers share a single account).
* **Forgot Password Flow**: A credential recovery option is provided at the login screen to allow password resets.
* **Role-Based Access Control**:
  1. **Admins**: Have full access to the Web Dashboard to manage products (SKUs), view live warehouse bins, inspect the immutable stock ledger, and view statistics.
  2. **Floor Workers**: Access a simplified, mobile-first warehouse interface to perform quick actions (Receive, Pick, and Audit stock).

---

## 2. Core Architecture: Immutable Stock Ledger
Unlike naive inventory apps that modify a `quantity` column directly in a product table, this application employs an **immutable, insert-only transaction ledger pattern**:
* **No UPDATE or DELETE Operations**: Once written, ledger records (`stock_ledger`) are never changed or removed.
* **On-the-Fly Dynamic Aggregation**: A product's current stock level is computed dynamically by summing up all `quantity_change` values (e.g., `+100` for `RECEIVE`, `-5` for `PICK`) associated with that product's ID.
* **Reconciliation and Auditing**: This model provides a perfect, tamper-proof history of every inventory movement, enabling simple audit trails and time-travel reports (finding the stock level at any specific date/time in the past).
* **Conflict-Free Syncing**: Because records are append-only, synchronizing offline mobile transactions is simple and avoids complex merge conflicts.

---

## 3. Technology Stack
* **Backend (FastAPI + PostgreSQL)**: Asynchronous Python REST API utilizing Pydantic models for validation, SQLAlchemy for database modeling, and JWT token authentication.
* **Frontend (React)**: Clean, interactive SPA built using React Router, Tailwind CSS, Context API for global state, and custom Swiss high-contrast grid components.
* **Mobile (React Native / Expo)**: Hybrid mobile application for barcode scanning and manual ledger logging, incorporating local SQLite caches and offline sync queues.
* **Database**: PostgreSQL (production and local testing) with automatic table initialization on server boot.

---

## 4. Database Schema Mapping

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

### Table Definitions & Details
1. **`users`**: Represents registered admins/workers.
2. **`products`**: Identifies unique catalog items via a **SKU** field. Defines low stock warning thresholds.
3. **`locations`**: Hierarchical warehouse slots mapped as:
   $$\text{Warehouse ID} \rightarrow \text{Zone} \rightarrow \text{Aisle} \rightarrow \text{Bin}$$
   *Example: `WH1` $\rightarrow$ `A` $\rightarrow$ `1` $\rightarrow$ `01` parses to path `WH1-A-1-01`.*
4. **`stock_ledger`**: The append-only ledger history. Contains signed quantities indicating inventory delta. Indexed on `product_id` and `timestamp` to optimize dynamic aggregation queries.

---

## 5. Design System: Swiss High-Contrast
The interface follows a premium, functional **Swiss High-Contrast Grid Design**:
* **Typography**:
  - Headings: `Cabinet Grotesk` (heavy weight, ultra-tight tracking).
  - Body: `IBM Plex Sans` (modern, geometric).
  - Data / SKUs / Quantities: `JetBrains Mono` for maximum readability.
* **Color System**:
  - Main Surfaces: Stark monochrome shades (pure white `#FFFFFF`, off-white `#F4F4F6`, dark slate `#0A0A0A`).
  - Primary Accent: International Klein Blue (`#002FA7`) for selected menus, main CTAs, and focus states.
  - Alert Accent: Destructive Red (`#FF3B30`) for low-stock items or error messages.
* **Layout Grid**: Flat surfaces separated by clean 1px borders; zero shadows, soft gradients, or blurs to reflect a precise, factory-floor control room feel.

---

## 6. Folder Structure Reference
```
inventoryTracker/
├── backend/                       # FastAPI Python Backend
│   ├── api/                       # Entry point mapping for cloud routing
│   │   └── index.py               # Imports FastAPI application
│   ├── tests/
│   │   └── backend_test.py        # 35+ regression and unit tests
│   ├── server.py                  # Database init, endpoints (Auth, Products, Locations, Ledger, Sync)
│   └── requirements.txt           # Python backend dependencies
├── frontend/                      # React Web Client
│   ├── public/                    # index.html, local assets, manifest
│   │   ├── login-bg.png           # Local Swiss-style warehouse background
│   │   └── onboarding-bg.png      # Local welcome onboarding graphic
│   ├── src/
│   │   ├── components/            # UI inputs, buttons, dialogs
│   │   ├── contexts/              # Authentication & user state
│   │   ├── pages/                 # Routing views (Login, Register, Dashboard, Products, Locations, Ledger)
│   │   └── App.js                 # App configuration & route guards
│   ├── craco.config.js            # Tailwind & build overrides
│   └── package.json               # Frontend dependencies & scripts
├── mobile/                        # React Native Expo Mobile App
│   ├── App.js                     # Mobile client loader & navigator
│   └── README.md                  # Mobile offline sync architecture
└── docs/                          # Guides and user walkthrough materials
```

---

## 7. Configuration & Local Execution

### Backend Server Setup
1. Setup Python virtual environment:
   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```
2. Create/edit backend `.env` configuration file:
   ```env
   DATABASE_URL=postgresql://username:password@localhost:5472/inventory
   ```
3. Run the development server:
   ```bash
   uvicorn server:app --reload --port 8000
   ```

### Frontend Setup
1. Install node dependencies:
   ```bash
   cd frontend
   npm install
   ```
2. Configure frontend variables in `.env.local`:
   ```env
   REACT_APP_BACKEND_URL=http://localhost:8000
   ```
3. Start the application:
   ```bash
   npm start
   ```

### Running Backend Tests
Ensure the server API works correctly by executing tests:
```bash
cd backend
pytest -v tests/backend_test.py
```
