# Product Requirements & Technical Specification Document

This document serves as the absolute, minute reference for the **Inventory Control & Management Platform**. It details every feature, business rule, database constraint, API contract, and operational workflow of the system, covering both the web dashboard and the mobile client application.

---

## 1. Executive Summary & Core Philosophy
The platform is designed to provide shop owners and warehouse managers with absolute visibility and auditability of their inventory. The core architecture centers around the **Immutable Ledger Pattern**:
* **No Mutations**: Inventory levels are never updated or deleted directly in the database.
* **Append-Only logs**: Every change in stock (receive, pick, transfer, adjust) is written as a signed transaction row.
* **On-Demand Computation**: Current inventory levels are aggregated dynamically on the fly by summing the transaction logs.
* **Auditable History**: Shop owners can query the exact state of their inventory at any specific timestamp in history.

---

## 2. User Roles & Access Control Matrix

The system enforces role-based access control (RBAC) across two primary personas:

| Feature / Domain | Admin User | Worker User |
| :--- | :---: | :---: |
| **Authentication** | Register / Login / Password Reset | Register / Login / Password Reset |
| **Shop Isolation** | Owns distinct `shop_id` | Joins Admin's `shop_id` |
| **Product Master Data** | CRUD (Create, Read, Update, Delete) | Read Only |
| **Location Master Data** | CRUD (Create, Read, Update, Delete) | Read Only |
| **Stock Ledger** | View full ledger / Record transactions | Record transactions / Sync offline queue |
| **Dashboard Stats** | Full view (KPIs, Alerts, Feed) | Redirected to Worker Page |
| **Mobile Client** | Read / Sync capability | Read / Sync / Barcode scan action |

---

## 3. Detailed Functional Specifications

### 3.1 Authentication & Session Management
* **Multi-Session Concurrency**: Accounts are restricted to a maximum of **2 active concurrent sessions** (combining desktop and mobile) to secure operations. Attempting a 3rd concurrent login returns a `409 Conflict`.
* **Security & JWT**: Authentication is stateless via JSON Web Tokens (JWT). The token payload embeds `session_id` to validate against active session registries.
* **Forgot Password Flow (OTP Recovery)**:
  - Password recovery uses a secure **6-digit numeric OTP** flow.
  - On requesting recovery (`POST /api/auth/forgot-password`), a hashed OTP record is generated with a 15-minute expiration window.
  - Verification (`POST /api/auth/verify-otp`) checks the matching OTP and exchanges it for a 10-minute temporary `reset_token`.
  - Password resetting (`POST /api/auth/reset-password`) validates the token and updates the hashed credential.

### 3.2 Shop Isolation (Multi-Tenancy)
* **Shop UUID**: Every database collection/table includes a `shop_id` attribute.
* **Registration**: When an Admin registers, a new unique `shop_id` (UUID) is generated. Workers register by supplying the target Admin's `shop_id`.
* **API Isolation**: All query operations filter results dynamically using the active session's `shop_id`.

### 3.3 Product Catalog (SKU Management)
* **Attributes**:
  - `id` (Primary Key, UUID)
  - `sku` (Unique string identifier)
  - `name` (Display label)
  - `description` (Optional details)
  - `low_stock_threshold` (Numeric configuration)
  - `unit` (Count units, e.g. `pcs`, `kg`)
  - `cost_price` (Decimal cost tracking)
  - `selling_price` (Decimal selling price tracking)
  - `category` (Optional category grouping)
  - `barcode` (Barcode/UPC number)
  - `shop_id` (Foreign reference)
  - `is_archived` (Soft deletion flag)
* **Business Rules**:
  - SKUs must be unique within a single shop tenant.
  - Current stock is calculated dynamically:
    $$\text{Current Stock} = \sum (\text{quantity\_change} \text{ for product\_id})$$

### 3.4 Warehouse Location Hierarchy
* **Attributes**:
  - `id` (Primary Key, UUID)
  - `warehouse_id` (Facility identifier, e.g. `WH1`)
  - `zone` (High-level sector, e.g. `A`)
  - `aisle` (Numeric path code, e.g. `12`)
  - `bin` (Specific slot/shelf index, e.g. `04`)
  - `capacity` (Optional maximum inventory unit limit)
  - `shop_id` (Foreign reference)
  - `is_archived` (Soft deletion flag)
* **Path Indexing**: Locations are indexed using a hyphenated string identifier: `[warehouse_id]-[zone]-[aisle]-[bin]`.

### 3.5 Immutable Stock Ledger Transactions
* **Attributes**:
  - `id` (Primary Key, UUID)
  - `product_id` (Foreign Key reference to Products)
  - `location_id` (Foreign Key reference to Locations)
  - `user_id` (Foreign Key reference to Users)
  - `transaction_type` (Enum: `RECEIVE`, `PICK`, `TRANSFER`, `AUDIT`)
  - `quantity_change` (Signed decimal quantity change)
  - `reference_number` (Optional invoice/PO/job reference string)
  - `notes` (Free-form operational text)
  - `timestamp` (UTC datetime of record entry)
  - `paired_transfer_id` (Self-referencing link for atomic double-leg transfers)
  - `supplier_id` (Foreign Key reference to Suppliers for receipts)
  - `batch_number`, `mfg_date`, `expiry_date` (Batch lifecycle tracking attributes)
  - `shop_id` (Foreign reference)
* **Transaction Types & Calculations**:
  - **`RECEIVE`**: Positive quantity change ($+q$).
  - **`PICK`**: Negative quantity change ($-q$).
  - **`TRANSFER`**: Creates two paired transaction records:
    1. A negative delta ($-q$) at the origin location (linked to the destination leg).
    2. A positive delta ($+q$) at the destination location (linked to the origin leg).
    Executed atomically inside a database transaction block.
  - **`AUDIT`**: Physical inventory reconciliation. An offset delta is calculated ($q_{\text{physical}} - q_{\text{ledger}}$) and written to adjust total stock.

### 3.6 Admin Web Dashboard & Reports
* **KPI Metrics Panel**: Shows six key statistics:
  1. **Total SKUs**: Total unique active products.
  2. **Total Bins**: Total active warehouse locations.
  3. **Total Stock**: Sum of all active ledger changes.
  4. **Low Stock Count**: Number of SKUs falling below their threshold.
  5. **Total Inventory Value**: Calculated as sum of $\text{current\_stock} \times \text{cost\_price}$ for all products.
  6. **Expiring Batches (30d)**: Batches expiring within the next 30 days.
* **Low Stock Alerts Widget**: Identifies products whose stock is below or equal to their warning thresholds.
* **Operator Activity Feed**: Displays the 10 most recent actions performed in the shop.
* **Stock Movement Compiler**: Allows generating a report detailing opening stock, received, picked, transferred, and closing stock per product over custom date windows with CSV export.

---

## 4. Mobile Client & Offline Sync Specifications

### 4.1 UI Design Guidelines
* Specialized simple workflows with massive touch targets (minimum height of 56px to 64px) to support glove-wearing operators on the warehouse floor.
* High-contrast monochrome theme containing a stark barcode camera framing reticle.

### 4.2 Local SQLite Schema (Offline Cache)
* **`products_cache`**: Caches SKU records, barcodes, and decimal stock levels locally.
* **`locations_cache`**: Caches active storage paths.
* **`pending_transactions`**: Stores transaction records logged offline (supports decimal quantities).

### 4.3 Sync Protocol
When connection to the backend is active, the app processes sync actions:
* **Sync Push**: Pushes all records queued in local `pending_transactions` to `/api/sync/push`. On backend validation, skips and warns about `PICK`s that would breach zero stock levels.
* **Sync Pull**: Pulls the master list of active product and location changes.

---

## 5. Detailed Database Schema Specification (PostgreSQL DDL)

```sql
-- Create USERS Table
CREATE TABLE users (
    id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'worker')),
    shop_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    phone VARCHAR(20),
    language_code VARCHAR(10) DEFAULT 'en'
);

-- Create PRODUCTS Table
CREATE TABLE products (
    id VARCHAR(255) PRIMARY KEY,
    sku VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    low_stock_threshold NUMERIC(12,3) DEFAULT 10,
    unit VARCHAR(50) DEFAULT 'pcs',
    price NUMERIC(12,2) DEFAULT 0,
    cost_price NUMERIC(12,2) DEFAULT 0,
    selling_price NUMERIC(12,2) DEFAULT 0,
    category VARCHAR(100),
    barcode VARCHAR(100),
    is_archived BOOLEAN DEFAULT FALSE,
    shop_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_sku_shop UNIQUE (sku, shop_id)
);

-- Create LOCATIONS Table
CREATE TABLE locations (
    id VARCHAR(255) PRIMARY KEY,
    warehouse_id VARCHAR(100) NOT NULL,
    zone VARCHAR(50) NOT NULL,
    aisle VARCHAR(50) NOT NULL,
    bin VARCHAR(50) NOT NULL,
    capacity INTEGER,
    is_archived BOOLEAN DEFAULT FALSE,
    shop_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_location_shop UNIQUE (warehouse_id, zone, aisle, bin, shop_id)
);

-- Create SUPPLIERS Table
CREATE TABLE suppliers (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    is_archived BOOLEAN DEFAULT FALSE,
    shop_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create STOCK_LEDGER Table
CREATE TABLE stock_ledger (
    id VARCHAR(255) PRIMARY KEY,
    product_id VARCHAR(255) REFERENCES products(id) ON DELETE CASCADE,
    location_id VARCHAR(255) REFERENCES locations(id) ON DELETE CASCADE,
    user_id VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
    transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN ('RECEIVE', 'PICK', 'TRANSFER', 'AUDIT')),
    quantity_change NUMERIC(12,3) NOT NULL,
    reference_number VARCHAR(100),
    notes TEXT,
    timestamp VARCHAR(100),
    paired_transfer_id VARCHAR(255) REFERENCES stock_ledger(id) ON DELETE SET NULL,
    supplier_id VARCHAR(255) REFERENCES suppliers(id) ON DELETE SET NULL,
    batch_number VARCHAR(100),
    mfg_date DATE,
    expiry_date DATE,
    shop_id VARCHAR(255) NOT NULL
);

-- Create SESSIONS Table
CREATE TABLE sessions (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
    device_label VARCHAR(255),
    last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create OTP_STORE Table
CREATE TABLE otp_store (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
    otp_hash VARCHAR(255) NOT NULL,
    reset_token VARCHAR(255),
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create NOTIFICATION_LOG Table
CREATE TABLE notification_log (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
    channel VARCHAR(50) NOT NULL,
    recipient VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Indexes for Performance
CREATE INDEX idx_ledger_product_shop ON stock_ledger (product_id, shop_id);
CREATE INDEX idx_product_barcode_shop ON products (barcode, shop_id);
```

---

## 6. API Endpoint Contracts

### 6.1 Authentication Enclave
* `POST /api/auth/register` -> Payload: `{ email, password, name, role, phone, language_code }`
* `POST /api/auth/login` -> Payload: `{ email, password }` (Restricts concurrency to $\le 2$).
* `POST /api/auth/forgot-password` -> Payload: `{ email }` (Triggers SMS/email OTP).
* `POST /api/auth/verify-otp` -> Payload: `{ email, otp }` (Returns `reset_token`).
* `POST /api/auth/reset-password` -> Payload: `{ reset_token, new_password }`
* `GET /api/auth/sessions` -> Returns active session devices.
* `DELETE /api/auth/sessions/{session_id}` -> Revokes an active session.

### 6.2 Catalog, Locations & Suppliers
* `GET /api/products` (Accepts `?include_archived=true`).
* `POST /api/products` (Admin only).
* `PUT /api/products/{id}` (Admin only).
* `DELETE /api/products/{id}` (Soft deletes, blocks if referenced in ledger).
* `GET /api/locations` (Accepts `?include_archived=true`).
* `GET /api/suppliers` (Accepts `?include_archived=true`).
* `POST /api/suppliers` (Admin only).
* `PUT /api/suppliers/{id}` (Admin only).
* `DELETE /api/suppliers/{id}` (Soft deletes).

### 6.3 Transaction Enclaves
* `POST /api/stock/transaction`
  - Payload: `{ product_id, location_id, transaction_type, quantity_change, reference_number, notes, origin_location_id, destination_location_id, supplier_id, batch_number, mfg_date, expiry_date }`
* `GET /api/stock/ledger` -> Returns full active transaction logs.

### 6.4 Reporting & Activity
* `GET /api/products/{id}/ledger` -> Returns paginated ledger entries.
* `GET /api/reports/movement` -> Returns aggregated stock movement stats.
* `GET /api/reports/expiry-alerts` -> Returns lists of expiring product batches.
* `GET /api/me/activity` -> Returns chronological operator activity log feed.
* `PUT /api/me/profile` -> Payload: `{ name, phone, language_code }` (Updates preferences).

---

## 7. Non-Functional & Security Requirements

### 7.1 Security & Cryptography
* **Password Hashing**: Cryptographic salt + hashing executed via `bcrypt`.
* **JWT Integrity**: Tokens are signed using HS256 algorithm with high-entropy keys.
* **Cookies**: Auth cookie is designated `secure` (HTTPS), `httpOnly`, and `SameSite=None`.

### 7.2 Data Integrity
* **Unique Constraints**: SKUs are strictly unique *within a single shop*.
* **Referential Integrity**: Ledger entries cannot refer to non-existent locations or products.
