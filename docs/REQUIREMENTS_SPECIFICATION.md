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
* **Multi-Session Concurrency**: To facilitate sharing operational accounts on the warehouse floor, the system allows up to **5 concurrent sessions** using the exact same username/credentials.
* **Security & JWT**: Authentication is stateless via JSON Web Tokens (JWT). The token is set in an `httpOnly` cookie with fallback support for a standard `Authorization: Bearer` request header.
* **Forgot Password Flow (Security Question)**:
  - During registration, users choose a predefined security question and store a hashed/case-insensitive security answer.
  - On password recovery, the user enters their email to fetch their security question, submits the case-insensitive answer, and sets a new password on successful validation.

### 3.2 Shop Isolation (Multi-Tenancy)
* **Shop UUID**: Every database collection/table includes a `shop_id` attribute.
* **Registration**: When an Admin registers, a new unique `shop_id` (UUID) is generated. Workers register by supplying the target Admin's `shop_id`.
* **API Isolation**: All query operations on Products, Locations, and the Stock Ledger filter results dynamically using the active session's `shop_id`. This prevents cross-tenant data leaks.

### 3.3 Product Catalog (SKU Management)
* **Attributes**:
  - `id` (Primary Key, UUID)
  - `sku` (Unique string identifier, rendered in monospace)
  - `name` (Display label)
  - `description` (Optional details)
  - `low_stock_threshold` (Integer configuration)
  - `unit` (Count units, e.g. `pcs`, `boxes`, `kg`)
  - `shop_id` (Foreign reference)
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
* **Path Indexing**: Locations are indexed using a hyphenated string identifier: `[warehouse_id]-[zone]-[aisle]-[bin]` (e.g. `WH1-A-12-04`).

### 3.5 Immutable Stock Ledger Transactions
* **Attributes**:
  - `id` (Primary Key, UUID)
  - `product_id` (Foreign Key reference to Products)
  - `location_id` (Foreign Key reference to Locations)
  - `user_id` (Foreign Key reference to Users)
  - `transaction_type` (Enum: `RECEIVE`, `PICK`, `TRANSFER`, `AUDIT`)
  - `quantity_change` (Signed integer, positive or negative)
  - `reference_number` (Optional invoice/PO/job reference string)
  - `notes` (Free-form operational text)
  - `timestamp` (UTC datetime of record entry)
  - `shop_id` (Foreign reference)
* **Transaction Types & Calculations**:
  - **`RECEIVE`**: Positive quantity change ($+q$). Increases stock level.
  - **`PICK`**: Negative quantity change ($-q$). Decreases stock level.
  - **`TRANSFER`**: Creates two paired transaction records:
    1. A negative delta ($-q$) at the origin location.
    2. A positive delta ($+q$) at the destination location.
  - **`AUDIT`**: Physical inventory reconciliation. An offset delta is calculated ($q_{\text{physical}} - q_{\text{ledger}}$) and written to adjust total stock to match the physical count.

### 3.6 Admin Web Dashboard
* **KPI Metrics Panel**: Shows four key statistics:
  1. **Total SKUs**: Total unique products registered in the shop.
  2. **Total Bins**: Total warehouse locations mapped.
  3. **Total Stock**: Sum of all ledger changes for the shop.
  4. **Low Stock Count**: Number of SKUs where dynamic stock falls below the `low_stock_threshold`.
* **Low Stock Alerts Widget**: Identifies and lists products whose dynamic current stock is less than or equal to their low-stock threshold.
* **Recent Activity Feed**: Lists the 10 most recent transactions chronologically.

---

## 4. Mobile Client & Offline Sync Specifications

### 4.1 UI Design Guidelines
* Specialized simple workflows with massive touch targets (minimum height of 56px to 64px) to support glove-wearing operators on the warehouse floor.
* High-contrast monochrome theme containing a stark barcode camera framing reticle.

### 4.2 Local SQLite Schema (Offline Cache)
* **`products_cache`**: Caches SKU records and calculated stock levels locally.
* **`locations_cache`**: Caches active storage paths.
* **`pending_transactions`**: Stores transaction records logged offline.

### 4.3 Sync Protocol
When connection to the backend is active, the app processes sync actions:
* **Sync Push**: Pushes all records queued in local `pending_transactions` to the backend endpoint `/api/sync/push`. On a successful 200 response, the local queue is cleared.
* **Sync Pull**: Pulls the master list of product and location changes committed since the device's last pull timestamp from `/api/sync/pull`.

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
    security_question VARCHAR(255) NOT NULL,
    security_answer_hash VARCHAR(255) NOT NULL,
    shop_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create PRODUCTS Table
CREATE TABLE products (
    id VARCHAR(255) PRIMARY KEY,
    sku VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    low_stock_threshold INTEGER DEFAULT 10,
    unit VARCHAR(50) DEFAULT 'pcs',
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
    shop_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_location_shop UNIQUE (warehouse_id, zone, aisle, bin, shop_id)
);

-- Create STOCK_LEDGER Table
CREATE TABLE stock_ledger (
    id VARCHAR(255) PRIMARY KEY,
    product_id VARCHAR(255) REFERENCES products(id) ON DELETE CASCADE,
    location_id VARCHAR(255) REFERENCES locations(id) ON DELETE CASCADE,
    user_id VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
    transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN ('RECEIVE', 'PICK', 'TRANSFER', 'AUDIT')),
    quantity_change INTEGER NOT NULL,
    reference_number VARCHAR(100),
    notes TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    shop_id VARCHAR(255) NOT NULL
);

-- Create Indexes for Dynamic Aggregation Performance
CREATE INDEX idx_ledger_product_shop ON stock_ledger (product_id, shop_id);
CREATE INDEX idx_ledger_timestamp ON stock_ledger (timestamp);
```

---

## 6. API Endpoint Contracts

### 6.1 Authentication Enclave
* `POST /api/auth/register`
  - **Payload**: `{ email, password, name, role, security_question, security_answer, shop_id? }`
  - **Behavior**: Creates a user. If `role` is `'admin'`, generates a new `shop_id` unless one is provided.
  - **Response**: `201 Created` with User data and session JWT.
* `POST /api/auth/login`
  - **Payload**: `{ email, password }`
  - **Behavior**: Validates credentials. Sets JWT in `httpOnly` secure cookie.
* `POST /api/auth/forgot-password`
  - **Payload**: `{ email }`
  - **Response**: `{ security_question }`
* `POST /api/auth/reset-password`
  - **Payload**: `{ email, security_answer, new_password }`
  - **Behavior**: Resets credentials on case-insensitive security answer match.

### 6.2 Catalog & Layout Enclaves
* `GET /api/products`
  - **Auth**: Required.
  - **Behavior**: Retrieves products filtering by user `shop_id`. Dynamic stock is computed and returned inside `current_stock`.
* `POST /api/products`
  - **Auth**: Admin Only.
  - **Payload**: `{ sku, name, description, low_stock_threshold, unit }`
* `GET /api/locations`
  - **Auth**: Required.
  - **Behavior**: Retrieves storage locations filtering by user `shop_id`.

### 6.3 Transaction Enclaves
* `POST /api/stock/transaction`
  - **Auth**: Required.
  - **Payload**: `{ product_id, location_id, transaction_type, quantity_change, reference_number, notes }`
  - **Behavior**: Performs constraints check: product and location must match the active session `shop_id`. Inserts new record.
* `GET /api/stock/ledger`
  - **Auth**: Required.
  - **Behavior**: Chronological list of transactions belonging to user `shop_id`.

---

## 7. Non-Functional & Security Requirements

### 7.1 Security & Cryptography
* **Password Hashing**: Cryptographic salt + hashing executed via `bcrypt`. Plaintext passwords are never logged or stored.
* **JWT Integrity**: Tokens are signed using HS256 algorithm with a high-entropy secret loaded from the environment (`JWT_SECRET`).
* **Cookies**: Auth cookie is designated `secure` (enforced over HTTPS), `httpOnly` (prevents XSS retrieval), and `SameSite=None` (allows cross-origin resource sharing).

### 7.2 Data Integrity
* **Unique Constraints**: SKUs are strictly constrained to be unique *within a single shop* (composite index of `sku` + `shop_id`).
* **Foreign Key Referential Integrity**: Database-level constraints ensure transaction ledger records cannot point to non-existent products or locations.

### 7.3 Performance Scaling
* **Dynamic Aggregations**: Dynamic aggregation pipelines scale utilizing index coverage (`idx_ledger_product_shop`).
* **Connection Pools**: Database connections reuse high-performance async pools to avoid connection leaks during heavy worker request cycles.
