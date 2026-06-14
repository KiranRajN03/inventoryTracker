import { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '@/lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Package, Plus, Pencil, Trash, LogOut } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { toast } from 'sonner';
import { BarcodeScanner } from '../components/BarcodeScanner';

export const Products = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({
    sku: '',
    name: '',
    description: '',
    low_stock_threshold: 10,
    unit: 'units'
  });

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/products`, { withCredentials: true });
      setProducts(data);
    } catch (err) {
      console.error('Failed to fetch products:', err);
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const handleProductScan = (scannedText) => {
    try {
      const data = JSON.parse(scannedText);
      setFormData({
        sku: data.sku || '',
        name: data.name || '',
        description: data.description || '',
        low_stock_threshold: data.low_stock_threshold !== undefined ? parseInt(data.low_stock_threshold, 10) : 10,
        unit: data.unit || 'units'
      });
      toast.success("Product details loaded from QR code!");
    } catch (e) {
      setFormData({
        ...formData,
        sku: scannedText
      });
      toast.info(`SKU populated: ${scannedText}`);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingProduct) {
        await axios.put(`${API_URL}/api/products/${editingProduct.id}`, formData, { withCredentials: true });
        toast.success('Product updated successfully');
      } else {
        await axios.post(`${API_URL}/api/products`, formData, { withCredentials: true });
        toast.success('Product created successfully');
      }
      setIsDialogOpen(false);
      setEditingProduct(null);
      setFormData({ sku: '', name: '', description: '', low_stock_threshold: 10, unit: 'units' });
      fetchProducts();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save product');
    }
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
    setFormData({
      sku: product.sku,
      name: product.name,
      description: product.description || '',
      low_stock_threshold: product.low_stock_threshold,
      unit: product.unit
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (productId) => {
    if (!window.confirm('Are you sure you want to delete this product?')) return;
    try {
      await axios.delete(`${API_URL}/api/products/${productId}`, { withCredentials: true });
      toast.success('Product deleted successfully');
      fetchProducts();
    } catch (err) {
      toast.error('Failed to delete product');
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F4F6]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#002FA7] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-[#737373] uppercase tracking-wide font-semibold">Loading Products...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F4F6]">
      {/* Header */}
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
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-[#E5E5E5] min-h-[calc(100vh-73px)] p-6">
          <nav className="space-y-2">
            <button onClick={() => navigate('/dashboard')} className="w-full text-left px-4 py-3 text-sm font-semibold hover:bg-[#F4F4F6]" data-testid="nav-dashboard">
              Dashboard
            </button>
            <button onClick={() => navigate('/products')} className="w-full text-left px-4 py-3 text-sm font-semibold bg-[#002FA7] text-white hover:bg-[#001F70]" data-testid="nav-products">
              Products
            </button>
            <button onClick={() => navigate('/locations')} className="w-full text-left px-4 py-3 text-sm font-semibold hover:bg-[#F4F4F6]" data-testid="nav-locations">
              Locations
            </button>
            <button onClick={() => navigate('/stock-ledger')} className="w-full text-left px-4 py-3 text-sm font-semibold hover:bg-[#F4F4F6]" data-testid="nav-ledger">
              Stock Ledger
            </button>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-black tracking-tighter mb-2" style={{fontFamily: 'Cabinet Grotesk, sans-serif'}}>Product Management</h2>
              <p className="text-sm text-[#737373]">Manage SKUs and inventory thresholds</p>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-[#002FA7] hover:bg-[#001F70] text-white rounded-none" onClick={() => {
                  setEditingProduct(null);
                  setFormData({ sku: '', name: '', description: '', low_stock_threshold: 10, unit: 'units' });
                }} data-testid="add-product-button">
                  <Plus size={16} className="mr-2" />
                  Add Product
                </Button>
              </DialogTrigger>
              <DialogContent className="border-[#E5E5E5] rounded-none max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-black tracking-tighter" style={{fontFamily: 'Cabinet Grotesk, sans-serif'}}>
                    {editingProduct ? 'Edit Product' : 'Add New Product'}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4" data-testid="product-form">
                  {!editingProduct && (
                    <BarcodeScanner onScan={handleProductScan} label="Scan SKU / QR for Details" />
                  )}
                  <div>
                    <Label className="text-xs uppercase tracking-wider font-bold text-[#737373] mb-2 block">SKU</Label>
                    <Input value={formData.sku} onChange={(e) => setFormData({...formData, sku: e.target.value})} required className="border-[#E5E5E5] rounded-none" data-testid="product-sku-input" />
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider font-bold text-[#737373] mb-2 block">Name</Label>
                    <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required className="border-[#E5E5E5] rounded-none" data-testid="product-name-input" />
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider font-bold text-[#737373] mb-2 block">Description</Label>
                    <Input value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} className="border-[#E5E5E5] rounded-none" data-testid="product-description-input" />
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider font-bold text-[#737373] mb-2 block">Low Stock Threshold</Label>
                    <Input type="number" value={formData.low_stock_threshold} onChange={(e) => setFormData({...formData, low_stock_threshold: parseInt(e.target.value)})} required className="border-[#E5E5E5] rounded-none" data-testid="product-threshold-input" />
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider font-bold text-[#737373] mb-2 block">Unit</Label>
                    <Input value={formData.unit} onChange={(e) => setFormData({...formData, unit: e.target.value})} required className="border-[#E5E5E5] rounded-none" data-testid="product-unit-input" />
                  </div>
                  <Button type="submit" className="w-full bg-[#002FA7] hover:bg-[#001F70] text-white rounded-none" data-testid="product-submit-button">
                    {editingProduct ? 'Update Product' : 'Create Product'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Products Table */}
          <div className="bg-white border border-[#E5E5E5]" data-testid="products-table">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#E5E5E5] bg-[#F4F4F6]">
                  <th className="text-left p-4 text-xs uppercase tracking-wider font-bold text-[#737373]">SKU</th>
                  <th className="text-left p-4 text-xs uppercase tracking-wider font-bold text-[#737373]">Product Name</th>
                  <th className="text-left p-4 text-xs uppercase tracking-wider font-bold text-[#737373]">Current Stock</th>
                  <th className="text-left p-4 text-xs uppercase tracking-wider font-bold text-[#737373]">Threshold</th>
                  <th className="text-left p-4 text-xs uppercase tracking-wider font-bold text-[#737373]">Unit</th>
                  <th className="text-right p-4 text-xs uppercase tracking-wider font-bold text-[#737373]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-[#737373]">
                      No products yet. Add your first product to get started.
                    </td>
                  </tr>
                ) : (
                  products.map((product, idx) => (
                    <tr key={product.id} className="border-b border-[#E5E5E5] last:border-0 hover:bg-[#F4F4F6]" data-testid={`product-row-${idx}`}>
                      <td className="p-4 mono font-semibold">{product.sku}</td>
                      <td className="p-4">{product.name}</td>
                      <td className="p-4 mono font-bold">{product.current_stock || 0}</td>
                      <td className="p-4 mono">{product.low_stock_threshold}</td>
                      <td className="p-4">{product.unit}</td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => handleEdit(product)} className="p-2 hover:bg-[#F4F4F6]" data-testid={`edit-product-${idx}`}>
                            <Pencil size={16} />
                          </button>
                          <button onClick={() => handleDelete(product.id)} className="p-2 hover:bg-[#F4F4F6] text-[#FF3B30]" data-testid={`delete-product-${idx}`}>
                            <Trash size={16} />
                          </button>
                        </div>
                      </td>
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
