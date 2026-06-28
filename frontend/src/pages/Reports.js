import { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '@/lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Download, Calendar, Filter, Archive, AlertCircle, FileText, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { Button } from '../components/ui/button';

export const Reports = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Stock Movement States
  const [movementFrom, setMovementFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [movementTo, setMovementTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [movementItems, setMovementItems] = useState([]);
  
  // Catalog List for Filter
  const [productsList, setProductsList] = useState([]);

  // Expiry Alerts States
  const [daysAhead, setDaysAhead] = useState(30);
  const [expiryAlerts, setExpiryAlerts] = useState([]);

  // SKU Ledger States
  const [ledgerSkuId, setLedgerSkuId] = useState('');
  const [ledgerItems, setLedgerItems] = useState([]);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerTotal, setLedgerTotal] = useState(0);

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchFilterCatalog();
    fetchExpiryAlerts();
  }, [daysAhead]);

  useEffect(() => {
    fetchStockMovement();
  }, [movementFrom, movementTo, selectedProduct, selectedType]);

  useEffect(() => {
    if (ledgerSkuId) {
      fetchSkuLedger();
    }
  }, [ledgerSkuId, ledgerPage]);

  const fetchFilterCatalog = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/products?include_archived=false`, { withCredentials: true });
      setProductsList(res.data);
      if (res.data.length > 0 && !ledgerSkuId) {
        setLedgerSkuId(res.data[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch filter catalog:', err);
    }
  };

  const fetchStockMovement = async () => {
    try {
      setLoading(true);
      const params = {
        from_date: movementFrom,
        to_date: movementTo,
      };
      if (selectedProduct) params.product_id = selectedProduct;
      if (selectedType) params.transaction_type = selectedType;

      const res = await axios.get(`${API_URL}/api/reports/movement`, { params, withCredentials: true });
      setMovementItems(res.data.items || []);
    } catch (err) {
      console.error('Failed to fetch movement report:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchExpiryAlerts = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/reports/expiry-alerts?days_ahead=${daysAhead}`, { withCredentials: true });
      setExpiryAlerts(res.data || []);
    } catch (err) {
      console.error('Failed to fetch expiry alerts:', err);
    }
  };

  const fetchSkuLedger = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/products/${ledgerSkuId}/ledger?page=${ledgerPage}&limit=10`, { withCredentials: true });
      setLedgerItems(res.data.items || []);
      setLedgerTotal(res.data.total || 0);
    } catch (err) {
      console.error('Failed to fetch SKU ledger:', err);
    }
  };

  const downloadMovementCSV = () => {
    if (movementItems.length === 0) return;
    
    const headers = ['Product ID', 'SKU', 'Product Name', 'Unit', 'Opening Stock', 'Received', 'Picked', 'Transferred', 'Closing Stock'];
    const csvRows = [headers.join(',')];
    
    for (const item of movementItems) {
      const row = [
        item.product_id,
        `"${item.sku.replace(/"/g, '""')}"`,
        `"${item.name.replace(/"/g, '""')}"`,
        item.unit,
        item.opening_stock,
        item.received,
        item.picked,
        item.transferred,
        item.closing_stock
      ];
      csvRows.push(row.join(','));
    }
    
    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Stock_Movement_Report_${movementFrom}_to_${movementTo}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#F4F4F6]">
      {/* Header */}
      <header className="bg-white border-b border-[#E5E5E5] sticky top-0 z-10">
        <div className="px-6 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-black tracking-tighter" style={{fontFamily: 'Cabinet Grotesk, sans-serif'}}>Inventory Control</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-[#737373]">{user?.name} ({user?.role})</span>
            <Button onClick={handleLogout} variant="outline" size="sm" className="border-[#E5E5E5] rounded-none">
              <LogOut size={16} className="mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Sidebar + Main Content */}
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-[#E5E5E5] min-h-[calc(100vh-73px)] p-6">
          <nav className="space-y-2">
            <button onClick={() => navigate('/dashboard')} className="w-full text-left px-4 py-3 text-sm font-semibold hover:bg-[#F4F4F6]">Dashboard</button>
            <button onClick={() => navigate('/products')} className="w-full text-left px-4 py-3 text-sm font-semibold hover:bg-[#F4F4F6]">Products</button>
            <button onClick={() => navigate('/locations')} className="w-full text-left px-4 py-3 text-sm font-semibold hover:bg-[#F4F4F6]">Locations</button>
            <button onClick={() => navigate('/stock-ledger')} className="w-full text-left px-4 py-3 text-sm font-semibold hover:bg-[#F4F4F6]">Stock Ledger</button>
            <button onClick={() => navigate('/reports')} className="w-full text-left px-4 py-3 text-sm font-semibold bg-[#002FA7] text-white hover:bg-[#001F70]">Reports</button>
            <button onClick={() => navigate('/worker')} className="w-full text-left px-4 py-3 text-sm font-semibold hover:bg-[#F4F4F6]">Warehouse Floor</button>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 space-y-6">
          <div>
            <h2 className="text-3xl font-black tracking-tighter mb-2" style={{fontFamily: 'Cabinet Grotesk, sans-serif'}}>Reports & Insights</h2>
            <p className="text-sm text-[#737373]">Inventory movement tracking, batch expirations, and custom CSV compilers.</p>
          </div>

          {/* Section 1: Stock Movement Report */}
          <div className="bg-white border border-[#E5E5E5] p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-[#F4F4F6] pb-4">
              <div className="flex items-center gap-2">
                <FileText size={20} className="text-[#002FA7]" />
                <h3 className="text-xl font-bold tracking-tight">Stock Movement Compiler</h3>
              </div>
              <Button onClick={downloadMovementCSV} disabled={movementItems.length === 0} className="rounded-none bg-[#002FA7] hover:bg-[#001F70] text-white">
                <Download size={16} className="mr-2" />
                Export CSV
              </Button>
            </div>

            {/* Filters Row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div>
                <label className="block text-xs uppercase font-bold text-[#737373] mb-1">From Date</label>
                <input
                  type="date"
                  value={movementFrom}
                  onChange={(e) => setMovementFrom(e.target.value)}
                  className="w-full border border-[#E5E5E5] px-3 py-2 text-sm focus:outline-none focus:border-[#002FA7]"
                />
              </div>
              <div>
                <label className="block text-xs uppercase font-bold text-[#737373] mb-1">To Date</label>
                <input
                  type="date"
                  value={movementTo}
                  onChange={(e) => setMovementTo(e.target.value)}
                  className="w-full border border-[#E5E5E5] px-3 py-2 text-sm focus:outline-none focus:border-[#002FA7]"
                />
              </div>
              <div>
                <label className="block text-xs uppercase font-bold text-[#737373] mb-1">Product SKU</label>
                <select
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                  className="w-full border border-[#E5E5E5] px-3 py-2 text-sm focus:outline-none focus:border-[#002FA7]"
                >
                  <option value="">All Products</option>
                  {productsList.map((p) => (
                    <option key={p.id} value={p.id}>{p.sku} - {p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs uppercase font-bold text-[#737373] mb-1">Transaction Type</label>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="w-full border border-[#E5E5E5] px-3 py-2 text-sm focus:outline-none focus:border-[#002FA7]"
                >
                  <option value="">All Types</option>
                  <option value="RECEIVE">RECEIVE</option>
                  <option value="PICK">PICK</option>
                  <option value="TRANSFER">TRANSFER</option>
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[#E5E5E5] bg-[#F4F4F6]">
                    <th className="py-3 px-4 font-bold">SKU</th>
                    <th className="py-3 px-4 font-bold">Product Name</th>
                    <th className="py-3 px-4 font-bold">Unit</th>
                    <th className="py-3 px-4 font-bold text-right">Opening</th>
                    <th className="py-3 px-4 font-bold text-right">Received</th>
                    <th className="py-3 px-4 font-bold text-right">Picked</th>
                    <th className="py-3 px-4 font-bold text-right">Transferred</th>
                    <th className="py-3 px-4 font-bold text-right">Closing</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-[#737373]">Compiling report data...</td>
                    </tr>
                  ) : movementItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-[#737373]">No movement records in this window.</td>
                    </tr>
                  ) : (
                    movementItems.map((item, idx) => (
                      <tr key={idx} className="border-b border-[#E5E5E5] hover:bg-[#F4F4F6] transition-colors">
                        <td className="py-3 px-4 mono font-semibold">{item.sku}</td>
                        <td className="py-3 px-4">{item.name}</td>
                        <td className="py-3 px-4">{item.unit}</td>
                        <td className="py-3 px-4 text-right mono">{item.opening_stock}</td>
                        <td className="py-3 px-4 text-right mono text-[#34C759]">{item.received > 0 ? `+${item.received}` : item.received}</td>
                        <td className="py-3 px-4 text-right mono text-[#FF3B30]">{item.picked}</td>
                        <td className="py-3 px-4 text-right mono text-[#002FA7]">{item.transferred}</td>
                        <td className="py-3 px-4 text-right mono font-bold">{item.closing_stock}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Grid for Expiry Alerts and granular SKU Ledger */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Expiry alerts */}
            <div className="bg-white border border-[#E5E5E5] p-6">
              <div className="flex items-center justify-between gap-4 mb-4 border-b border-[#F4F4F6] pb-4">
                <div className="flex items-center gap-2">
                  <AlertCircle size={20} className="text-[#FF3B30]" />
                  <h3 className="text-xl font-bold tracking-tight">Expiring Batches</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#737373] uppercase font-bold">Days ahead:</span>
                  <select
                    value={daysAhead}
                    onChange={(e) => setDaysAhead(parseInt(e.target.value))}
                    className="border border-[#E5E5E5] px-2 py-1 text-xs focus:outline-none focus:border-[#002FA7]"
                  >
                    <option value="15">15 Days</option>
                    <option value="30">30 Days</option>
                    <option value="60">60 Days</option>
                    <option value="90">90 Days</option>
                  </select>
                </div>
              </div>

              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                {expiryAlerts.length === 0 ? (
                  <p className="text-sm text-[#737373] py-4 text-center">No batches expiring within {daysAhead} days.</p>
                ) : (
                  expiryAlerts.map((alert, idx) => (
                    <div key={idx} className="border border-[#E5E5E5] p-4 space-y-2 hover:border-[#FF3B30] transition-colors">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-[#FF3B30]">{alert.name}</span>
                        <span className="text-xs uppercase bg-[#FFEBEA] text-[#FF3B30] font-bold px-2 py-0.5">Expiring</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-[#737373]">SKU:</span> <span className="mono font-semibold">{alert.sku}</span>
                        </div>
                        <div>
                          <span className="text-[#737373]">Batch:</span> <span className="mono font-semibold">{alert.batch_number || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-[#737373]">Expiry:</span> <span className="mono font-semibold">{alert.expiry_date}</span>
                        </div>
                        <div>
                          <span className="text-[#737373]">Current Stock:</span> <span className="mono font-semibold">{alert.current_stock}</span>
                        </div>
                      </div>
                      <div className="text-xs text-[#737373] pt-1 border-t border-[#F4F4F6]">
                        Location: {alert.location_path}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Granular SKU Ledger */}
            <div className="bg-white border border-[#E5E5E5] p-6">
              <div className="flex items-center justify-between gap-4 mb-4 border-b border-[#F4F4F6] pb-4">
                <div className="flex items-center gap-2">
                  <Calendar size={20} className="text-[#002FA7]" />
                  <h3 className="text-xl font-bold tracking-tight">Granular Product Log</h3>
                </div>
                <select
                  value={ledgerSkuId}
                  onChange={(e) => {
                    setLedgerSkuId(e.target.value);
                    setLedgerPage(1);
                  }}
                  className="border border-[#E5E5E5] px-2 py-1 text-xs focus:outline-none focus:border-[#002FA7] max-w-[200px]"
                >
                  {productsList.map((p) => (
                    <option key={p.id} value={p.id}>{p.sku} - {p.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                {ledgerItems.length === 0 ? (
                  <p className="text-sm text-[#737373] py-4 text-center">No transactions registered for this product.</p>
                ) : (
                  ledgerItems.map((tx, idx) => (
                    <div key={idx} className="border border-[#E5E5E5] p-4 space-y-2 hover:border-[#002FA7] transition-colors">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold px-2 py-0.5 uppercase ${
                          tx.transaction_type === 'RECEIVE' ? 'bg-[#EBFDF2] text-[#34C759]' :
                          tx.transaction_type === 'PICK' ? 'bg-[#FFEBEA] text-[#FF3B30]' : 'bg-[#EBF0FD] text-[#002FA7]'
                        }`}>{tx.transaction_type}</span>
                        <span className="text-xs text-[#737373]">{new Date(tx.timestamp).toLocaleString()}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-[#737373]">Quantity:</span> <span className="mono font-bold">{tx.quantity_change > 0 ? '+' : ''}{tx.quantity_change}</span>
                        </div>
                        <div>
                          <span className="text-[#737373]">Operator:</span> <span>{tx.user_name}</span>
                        </div>
                        {tx.batch_number && (
                          <div>
                            <span className="text-[#737373]">Batch:</span> <span className="mono">{tx.batch_number}</span>
                          </div>
                        )}
                        {tx.reference_number && (
                          <div>
                            <span className="text-[#737373]">Ref:</span> <span>{tx.reference_number}</span>
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-[#737373] pt-1 border-t border-[#F4F4F6]">
                        Path: {tx.location_path}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Pagination */}
              {ledgerTotal > 10 && (
                <div className="flex items-center justify-between pt-4 border-t border-[#E5E5E5] mt-4">
                  <span className="text-xs text-[#737373]">Showing {(ledgerPage - 1) * 10 + 1}-{Math.min(ledgerPage * 10, ledgerTotal)} of {ledgerTotal}</span>
                  <div className="flex gap-2">
                    <Button
                      disabled={ledgerPage === 1}
                      onClick={() => setLedgerPage((p) => p - 1)}
                      variant="outline"
                      size="sm"
                      className="rounded-none px-2"
                    >
                      <ChevronLeft size={16} />
                    </Button>
                    <Button
                      disabled={ledgerPage * 10 >= ledgerTotal}
                      onClick={() => setLedgerPage((p) => p + 1)}
                      variant="outline"
                      size="sm"
                      className="rounded-none px-2"
                    >
                      <ChevronRight size={16} />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};
