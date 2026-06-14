import api from './api';
import { 
  getUnsyncedTransactions, 
  markAsSynced, 
  cacheProducts, 
  cacheLocations 
} from './database';

// Trigger background pushing of pending local offline transactions
export async function pushPendingTransactions() {
  try {
    const unsynced = await getUnsyncedTransactions();
    if (unsynced.length === 0) {
      console.log('Sync Queue: No pending transactions to sync.');
      return { success: true, count: 0 };
    }

    console.log(`Sync Queue: Found ${unsynced.length} pending transactions. Attempting to push...`);
    
    // Map database fields back to backend StockLedgerCreate expected request model
    const payload = {
      transactions: unsynced.map(t => ({
        product_id: t.product_id,
        location_id: t.location_id,
        transaction_type: t.transaction_type,
        quantity_change: t.quantity_change,
        reference_number: t.reference_number || null,
        notes: t.notes || null
      }))
    };

    const response = await api.post('/sync/push', payload);
    
    if (response.status === 200) {
      const txIds = unsynced.map(t => t.id);
      await markAsSynced(txIds);
      console.log(`Sync Queue: Successfully synchronized ${unsynced.length} transactions to server.`);
      return { success: true, count: unsynced.length };
    }
    
    throw new Error(`Sync failed with status code ${response.status}`);
  } catch (error) {
    console.error('Sync Queue error occurred during push:', error);
    return { success: false, error: error.message };
  }
}

// Pull fresh master SKU catalog and bin listings from backend to update SQLite
export async function pullFreshMasterData() {
  try {
    console.log('Sync Queue: Syncing Master Catalogs...');
    
    // Concurrently fetch products and locations
    const [productsRes, locationsRes] = await Promise.all([
      api.get('/products'),
      api.get('/locations'),
    ]);

    if (productsRes.status === 200 && locationsRes.status === 200) {
      await cacheProducts(productsRes.data);
      await cacheLocations(locationsRes.data);
      console.log('Sync Queue: Local SQLite Master data cache populated.');
      return { success: true };
    }
    
    throw new Error('Could not pull master data from server');
  } catch (error) {
    console.error('Sync Queue error occurred during pull:', error);
    return { success: false, error: error.message };
  }
}

// Perform full sync process (Push transactions -> Pull fresh catalogs)
export async function runFullSync() {
  console.log('Sync Queue: Starting full sync...');
  const pushRes = await pushPendingTransactions();
  if (pushRes.success) {
    const pullRes = await pullFreshMasterData();
    return { 
      success: pullRes.success, 
      syncedCount: pushRes.count, 
      error: pullRes.error 
    };
  }
  return { success: false, syncedCount: 0, error: pushRes.error };
}
