-- Phase 1 Migration: Additions and Corrections

-- 1. Modify stock_ledger.quantity_change to NUMERIC(12,3)
ALTER TABLE stock_ledger ALTER COLUMN quantity_change TYPE NUMERIC(12,3);

-- 2. Soft-delete columns
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. TRANSFER atomicity paired ID
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS paired_transfer_id VARCHAR(255) REFERENCES stock_ledger(id) ON DELETE SET NULL;

-- 4. Supplier Table
CREATE TABLE IF NOT EXISTS suppliers (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(255),
    address TEXT,
    shop_id VARCHAR(255) NOT NULL,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS supplier_id VARCHAR(255) REFERENCES suppliers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_supplier_shop ON suppliers (shop_id);

-- 5. Batch and expiry tracking
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS batch_number VARCHAR(100);
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS mfg_date DATE;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS expiry_date DATE;

-- 6. Product enhancements
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,2) DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS selling_price NUMERIC(12,2) DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode VARCHAR(100);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_barcode_shop ON products (barcode, shop_id) WHERE barcode IS NOT NULL;

-- 7. Device sessions table
CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_label VARCHAR(255),
    last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

-- 8. OTP Store table
CREATE TABLE IF NOT EXISTS otp_store (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    otp_hash VARCHAR(255) NOT NULL,
    reset_token VARCHAR(255),
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. Notification Log & User details
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS language_code VARCHAR(10) DEFAULT 'en';

CREATE TABLE IF NOT EXISTS notification_log (
    id VARCHAR(255) PRIMARY KEY,
    shop_id VARCHAR(255) NOT NULL,
    product_id VARCHAR(255) NOT NULL,
    channel VARCHAR(20) NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
