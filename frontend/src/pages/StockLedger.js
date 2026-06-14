import { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '@/lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { ListChecks, Plus, LogOut } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { toast } from 'sonner';

export const StockLedger = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [ledger, setLedger] = useState([]);
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    product_id: '',
    location_id: '',
    transaction_type: 'RECEIVE',
    quantity_change: 0,
    reference_number: '',
    notes: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [ledgerRes, productsRes, locationsRes] = await Promise.all([
        axios.get(`${API_URL}/api/stock/ledger?limit=100`, { withCredentials: true }),
        axios.get(`${API_URL}/api/products`, { withCredentials: true }),
        axios.get(`${API_URL}/api/locations`, { withCredentials: true })
      ]);
      setLedger(ledgerRes.data);
      setProducts(productsRes.data);
      setLocations(locationsRes.data);
    } catch (err) {
      console.error('Failed to fetch data:', err);
      toast.error('Failed to load stock ledger');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const qty = parseInt(formData.quantity_change, 10) || 0;
      const finalQuantity = formData.transaction_type === 'RECEIVE'
        ? Math.abs(qty)
        : formData.transaction_type === 'PICK'
          ? -Math.abs(qty)
          : qty;

      const payload = {
        ...formData,
        quantity_change: finalQuantity
      };

      await axios.post(`${API_URL}/api/stock/transaction`, payload, { withCredentials: true });
      toast.success('Transaction recorded successfully');
      setIsDialogOpen(false);
      setFormData({
        product_id: '',
        location_id: '',
        transaction_type: 'RECEIVE',
        quantity_change: 0,
        reference_number: '',
        notes: ''
      });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to record transaction');
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const getProductName = (productId) => {
    const product = products.find(p => p.id === productId);
    return product ? `${product.sku} - ${product.name}` : productId;
  };

  const getLocationName = (locationId) => {
    const location = locations.find(l => l.id === locationId);
    return location ? `${location.warehouse_id}-${location.zone}-${location.aisle}-${location.bin}` : locationId;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F4F6]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#002FA7] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-[#737373] uppercase tracking-wide font-semibold">Loading Ledger...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F4F6]">
      <header className="bg-white border-b border-[#E5E5E5] sticky top-0 z-10">
        <div className="px-6 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-black tracking-tighter" style={{fontFamily: 'Cabinet Grotesk, sans-serif'}}>Inventory Control</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-[#737373]">{user?.name} ({user?.role})</span>
            <Button onClick={handleLogout} variant="outline" size="sm" className="border-[#E5E5E5] rounded-none" data-testid="logout-button">
              <LogOut size={16} className="mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        <aside className="w-64 bg-white border-r border-[#E5E5E5] min-h-[calc(100vh-73px)] p-6">
          <nav className="space-y-2">
            <button onClick={() => navigate('/dashboard')} className="w-full text-left px-4 py-3 text-sm font-semibold hover:bg-[#F4F4F6]" data-testid="nav-dashboard">
              Dashboard
            </button>
            <button onClick={() => navigate('/products')} className="w-full text-left px-4 py-3 text-sm font-semibold hover:bg-[#F4F4F6]" data-testid="nav-products">
              Products
            </button>
            <button onClick={() => navigate('/locations')} className="w-full text-left px-4 py-3 text-sm font-semibold hover:bg-[#F4F4F6]" data-testid="nav-locations">
              Locations
            </button>
            <button onClick={() => navigate('/stock-ledger')} className="w-full text-left px-4 py-3 text-sm font-semibold bg-[#002FA7] text-white hover:bg-[#001F70]" data-testid="nav-ledger">
              Stock Ledger
            </button>
          </nav>
        </aside>

        <main className="flex-1 p-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-black tracking-tighter mb-2" style={{fontFamily: 'Cabinet Grotesk, sans-serif'}}>Stock Ledger</h2>
              <p className="text-sm text-[#737373]">Immutable transaction history</p>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-[#002FA7] hover:bg-[#001F70] text-white rounded-none" data-testid="add-transaction-button">
                  <Plus size={16} className="mr-2" />
                  Record Transaction
                </Button>
              </DialogTrigger>
              <DialogContent className="border-[#E5E5E5] rounded-none max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-black tracking-tighter" style={{fontFamily: 'Cabinet Grotesk, sans-serif'}}>Record Stock Transaction</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4" data-testid="transaction-form">
                  <div>
                    <Label className="text-xs uppercase tracking-wider font-bold text-[#737373] mb-2 block">Product</Label>
                    <Select value={formData.product_id} onValueChange={(val) => setFormData({...formData, product_id: val})}>
                      <SelectTrigger className="border-[#E5E5E5] rounded-none" data-testid="transaction-product-select">
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.sku} - {p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider font-bold text-[#737373] mb-2 block">Location</Label>
                    <Select value={formData.location_id} onValueChange={(val) => setFormData({...formData, location_id: val})}>
                      <SelectTrigger className="border-[#E5E5E5] rounded-none" data-testid="transaction-location-select">
                        <SelectValue placeholder="Select location" />
                      </SelectTrigger>
                      <SelectContent>
                        {locations.map(l => (
                          <SelectItem key={l.id} value={l.id}>{l.warehouse_id}-{l.zone}-{l.aisle}-{l.bin}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider font-bold text-[#737373] mb-2 block">Transaction Type</Label>
                    <Select value={formData.transaction_type} onValueChange={(val) => setFormData({...formData, transaction_type: val})}>
                      <SelectTrigger className="border-[#E5E5E5] rounded-none" data-testid="transaction-type-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="RECEIVE">Receive</SelectItem>
                        <SelectItem value="PICK">Pick</SelectItem>
                        <SelectItem value="TRANSFER">Transfer</SelectItem>
                        <SelectItem value="AUDIT">Audit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider font-bold text-[#737373] mb-2 block">Quantity Change</Label>
                    <Input type="number" value={formData.quantity_change} onChange={(e) => setFormData({...formData, quantity_change: parseInt(e.target.value) || 0})} required className="border-[#E5E5E5] rounded-none" data-testid="transaction-quantity-input" />
                    {formData.transaction_type === 'RECEIVE' && (
                      <p className="text-xs text-[#002FA7] font-semibold mt-1">Stock count will increase by {Math.abs(formData.quantity_change || 0)}</p>
                    )}
                    {formData.transaction_type === 'PICK' && (
                      <p className="text-xs text-[#FF3B30] font-semibold mt-1">Stock count will decrease by {Math.abs(formData.quantity_change || 0)}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider font-bold text-[#737373] mb-2 block">Reference # (optional)</Label>
                    <Input value={formData.reference_number} onChange={(e) => setFormData({...formData, reference_number: e.target.value})} className="border-[#E5E5E5] rounded-none" data-testid="transaction-reference-input" />
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider font-bold text-[#737373] mb-2 block">Notes (optional)</Label>
                    <Input value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} className="border-[#E5E5E5] rounded-none" data-testid="transaction-notes-input" />
                  </div>
                  <Button type="submit" className="w-full bg-[#002FA7] hover:bg-[#001F70] text-white rounded-none" data-testid="transaction-submit-button">
                    Record Transaction
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="bg-white border border-[#E5E5E5]" data-testid="ledger-table">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#E5E5E5] bg-[#F4F4F6]">
                  <th className="text-left p-4 text-xs uppercase tracking-wider font-bold text-[#737373]">Timestamp</th>
                  <th className="text-left p-4 text-xs uppercase tracking-wider font-bold text-[#737373]">Type</th>
                  <th className="text-left p-4 text-xs uppercase tracking-wider font-bold text-[#737373]">Product</th>
                  <th className="text-left p-4 text-xs uppercase tracking-wider font-bold text-[#737373]">Location</th>
                  <th className="text-left p-4 text-xs uppercase tracking-wider font-bold text-[#737373]">Quantity</th>
                  <th className="text-left p-4 text-xs uppercase tracking-wider font-bold text-[#737373]">Reference</th>
                </tr>
              </thead>
              <tbody>
                {ledger.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-[#737373]">
                      No transactions yet. Record your first transaction to get started.
                    </td>
                  </tr>
                ) : (
                  ledger.map((tx, idx) => (
                    <tr key={tx.id} className="border-b border-[#E5E5E5] last:border-0 hover:bg-[#F4F4F6]" data-testid={`ledger-row-${idx}`}>
                      <td className="p-4 text-sm mono">{new Date(tx.timestamp).toLocaleString()}</td>
                      <td className="p-4">
                        <span className="inline-block px-2 py-1 text-xs font-bold bg-[#F4F4F6] border border-[#E5E5E5]">{tx.transaction_type}</span>
                      </td>
                      <td className="p-4 text-sm">{getProductName(tx.product_id)}</td>
                      <td className="p-4 text-sm mono">{getLocationName(tx.location_id)}</td>
                      <td className="p-4 mono font-bold">{tx.quantity_change > 0 ? '+' : ''}{tx.quantity_change}</td>
                      <td className="p-4 text-sm mono">{tx.reference_number || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  );
};
