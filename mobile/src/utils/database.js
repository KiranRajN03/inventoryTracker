import * as SQLite from 'expo-sqlite';

let dbInstance = null;

// Opens or retrieves database connection asynchronously
export async function getDatabase() {
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync('inventory_offline.db');
  }
  return dbInstance;
}

// Initial database seeding and table generation
export async function initDatabase() {
  const db = await getDatabase();
  
  // 1. Create local product cache table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS products_cache (
      id TEXT PRIMARY KEY,
      sku TEXT UNIQUE,
      name TEXT,
      description TEXT,
      low_stock_threshold INTEGER,
      unit TEXT,
      current_stock INTEGER,
      price REAL DEFAULT 0.0,
      created_at TEXT
    );
  `);

  // Run SQLite migration to add price column if database was initialized in prior steps
  try {
    await db.execAsync("ALTER TABLE products_cache ADD COLUMN price REAL DEFAULT 0.0;");
  } catch (e) {
    // Column already exists or table was just created
  }

  // 2. Create local location cache table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS locations_cache (
      id TEXT PRIMARY KEY,
      warehouse_id TEXT,
      zone TEXT,
      aisle TEXT,
      bin TEXT,
      capacity INTEGER,
      created_at TEXT
    );
  `);

  // 3. Create immutable local transaction queue table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS pending_transactions (
      id TEXT PRIMARY KEY,
      product_id TEXT,
      location_id TEXT,
      transaction_type TEXT,
      quantity_change INTEGER,
      reference_number TEXT,
      notes TEXT,
      timestamp TEXT,
      synced INTEGER DEFAULT 0
    );
  `);
  
  console.log('Local SQLite offline database initialized successfully.');
}

// Clear and rebuild caches with server-fetched products
export async function cacheProducts(products) {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM products_cache');
  for (const p of products) {
    await db.runAsync(
      `INSERT OR REPLACE INTO products_cache 
       (id, sku, name, description, low_stock_threshold, unit, current_stock, price, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [p.id, p.sku, p.name, p.description || '', p.low_stock_threshold, p.unit, p.current_stock || 0, p.price || 0.0, p.created_at]
    );
  }
}

// Clear and rebuild caches with server-fetched locations
export async function cacheLocations(locations) {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM locations_cache');
  for (const l of locations) {
    await db.runAsync(
      `INSERT OR REPLACE INTO locations_cache 
       (id, warehouse_id, zone, aisle, bin, capacity, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [l.id, l.warehouse_id, l.zone, l.aisle, l.bin, l.capacity || 0, l.created_at]
    );
  }
}

// Get all products from local cache
export async function getCachedProducts() {
  const db = await getDatabase();
  return await db.getAllAsync('SELECT * FROM products_cache ORDER BY sku ASC');
}

// Get product details by barcode SKU or ID
export async function getCachedProductBySKU(sku) {
  const db = await getDatabase();
  return await db.getFirstAsync('SELECT * FROM products_cache WHERE sku = ?', [sku]);
}

// Get all locations from local cache
export async function getCachedLocations() {
  const db = await getDatabase();
  return await db.getAllAsync('SELECT * FROM locations_cache ORDER BY warehouse_id, zone, aisle, bin ASC');
}

// Retrieve single location path by string representation (e.g. WH1-A-1-01)
export async function getCachedLocationDetails(id) {
  const db = await getDatabase();
  return await db.getFirstAsync('SELECT * FROM locations_cache WHERE id = ?', [id]);
}

// Log a local transaction to the queue
export async function addPendingTransaction(tx) {
  const db = await getDatabase();
  const id = tx.id || Math.random().toString(36).substring(2, 15);
  const timestamp = tx.timestamp || new Date().toISOString();
  
  await db.runAsync(
    `INSERT INTO pending_transactions 
     (id, product_id, location_id, transaction_type, quantity_change, reference_number, notes, timestamp, synced) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [id, tx.product_id, tx.location_id, tx.transaction_type, tx.quantity_change, tx.reference_number || '', tx.notes || '', timestamp]
  );
  
  // Update local product cache stock level representation immediately
  await db.runAsync(
    `UPDATE products_cache SET current_stock = current_stock + ? WHERE id = ?`,
    [tx.quantity_change, tx.product_id]
  );
  
  return id;
}

// Fetch all unsynced transactions in queue
export async function getUnsyncedTransactions() {
  const db = await getDatabase();
  return await db.getAllAsync('SELECT * FROM pending_transactions WHERE synced = 0 ORDER BY timestamp ASC');
}

// Mark transactions as synced
export async function markAsSynced(txIds) {
  if (!txIds || txIds.length === 0) return;
  const db = await getDatabase();
  const placeholders = txIds.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE pending_transactions SET synced = 1 WHERE id IN (${placeholders})`,
    txIds
  );
}

// Update local product cache price level representation immediately
export async function updateCachedProductPrice(productId, newPrice) {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE products_cache SET price = ? WHERE id = ?`,
    [parseFloat(newPrice) || 0.0, productId]
  );
}
