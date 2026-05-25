import { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '@/lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { MapPin, Plus, Pencil, Trash, LogOut } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { toast } from 'sonner';

export const Locations = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [formData, setFormData] = useState({
    warehouse_id: '',
    zone: '',
    aisle: '',
    bin: '',
    capacity: ''
  });

  useEffect(() => {
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/locations`, { withCredentials: true });
      setLocations(data);
    } catch (err) {
      console.error('Failed to fetch locations:', err);
      toast.error('Failed to load locations');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        capacity: formData.capacity ? parseInt(formData.capacity) : null
      };
      if (editingLocation) {
        await axios.put(`${API_URL}/api/locations/${editingLocation.id}`, payload, { withCredentials: true });
        toast.success('Location updated successfully');
      } else {
        await axios.post(`${API_URL}/api/locations`, payload, { withCredentials: true });
        toast.success('Location created successfully');
      }
      setIsDialogOpen(false);
      setEditingLocation(null);
      setFormData({ warehouse_id: '', zone: '', aisle: '', bin: '', capacity: '' });
      fetchLocations();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save location');
    }
  };

  const handleEdit = (location) => {
    setEditingLocation(location);
    setFormData({
      warehouse_id: location.warehouse_id,
      zone: location.zone,
      aisle: location.aisle,
      bin: location.bin,
      capacity: location.capacity?.toString() || ''
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (locationId) => {
    if (!window.confirm('Are you sure you want to delete this location?')) return;
    try {
      await axios.delete(`${API_URL}/api/locations/${locationId}`, { withCredentials: true });
      toast.success('Location deleted successfully');
      fetchLocations();
    } catch (err) {
      toast.error('Failed to delete location');
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
          <p className="text-sm text-[#737373] uppercase tracking-wide font-semibold">Loading Locations...</p>
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
            <button onClick={() => navigate('/locations')} className="w-full text-left px-4 py-3 text-sm font-semibold bg-[#002FA7] text-white hover:bg-[#001F70]" data-testid="nav-locations">
              Locations
            </button>
            <button onClick={() => navigate('/stock-ledger')} className="w-full text-left px-4 py-3 text-sm font-semibold hover:bg-[#F4F4F6]" data-testid="nav-ledger">
              Stock Ledger
            </button>
          </nav>
        </aside>

        <main className="flex-1 p-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-black tracking-tighter mb-2" style={{fontFamily: 'Cabinet Grotesk, sans-serif'}}>Location Management</h2>
              <p className="text-sm text-[#737373]">Manage warehouse zones and storage bins</p>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-[#002FA7] hover:bg-[#001F70] text-white rounded-none" onClick={() => {
                  setEditingLocation(null);
                  setFormData({ warehouse_id: '', zone: '', aisle: '', bin: '', capacity: '' });
                }} data-testid="add-location-button">
                  <Plus size={16} className="mr-2" />
                  Add Location
                </Button>
              </DialogTrigger>
              <DialogContent className="border-[#E5E5E5] rounded-none max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-black tracking-tighter" style={{fontFamily: 'Cabinet Grotesk, sans-serif'}}>
                    {editingLocation ? 'Edit Location' : 'Add New Location'}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4" data-testid="location-form">
                  <div>
                    <Label className="text-xs uppercase tracking-wider font-bold text-[#737373] mb-2 block">Warehouse ID</Label>
                    <Input value={formData.warehouse_id} onChange={(e) => setFormData({...formData, warehouse_id: e.target.value})} required className="border-[#E5E5E5] rounded-none" data-testid="location-warehouse-input" />
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider font-bold text-[#737373] mb-2 block">Zone</Label>
                    <Input value={formData.zone} onChange={(e) => setFormData({...formData, zone: e.target.value})} required className="border-[#E5E5E5] rounded-none" data-testid="location-zone-input" />
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider font-bold text-[#737373] mb-2 block">Aisle</Label>
                    <Input value={formData.aisle} onChange={(e) => setFormData({...formData, aisle: e.target.value})} required className="border-[#E5E5E5] rounded-none" data-testid="location-aisle-input" />
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider font-bold text-[#737373] mb-2 block">Bin</Label>
                    <Input value={formData.bin} onChange={(e) => setFormData({...formData, bin: e.target.value})} required className="border-[#E5E5E5] rounded-none" data-testid="location-bin-input" />
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider font-bold text-[#737373] mb-2 block">Capacity (optional)</Label>
                    <Input type="number" value={formData.capacity} onChange={(e) => setFormData({...formData, capacity: e.target.value})} className="border-[#E5E5E5] rounded-none" data-testid="location-capacity-input" />
                  </div>
                  <Button type="submit" className="w-full bg-[#002FA7] hover:bg-[#001F70] text-white rounded-none" data-testid="location-submit-button">
                    {editingLocation ? 'Update Location' : 'Create Location'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="bg-white border border-[#E5E5E5]" data-testid="locations-table">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#E5E5E5] bg-[#F4F4F6]">
                  <th className="text-left p-4 text-xs uppercase tracking-wider font-bold text-[#737373]">Warehouse</th>
                  <th className="text-left p-4 text-xs uppercase tracking-wider font-bold text-[#737373]">Zone</th>
                  <th className="text-left p-4 text-xs uppercase tracking-wider font-bold text-[#737373]">Aisle</th>
                  <th className="text-left p-4 text-xs uppercase tracking-wider font-bold text-[#737373]">Bin</th>
                  <th className="text-left p-4 text-xs uppercase tracking-wider font-bold text-[#737373]">Capacity</th>
                  <th className="text-right p-4 text-xs uppercase tracking-wider font-bold text-[#737373]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {locations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-[#737373]">
                      No locations yet. Add your first location to get started.
                    </td>
                  </tr>
                ) : (
                  locations.map((location, idx) => (
                    <tr key={location.id} className="border-b border-[#E5E5E5] last:border-0 hover:bg-[#F4F4F6]" data-testid={`location-row-${idx}`}>
                      <td className="p-4 mono font-semibold">{location.warehouse_id}</td>
                      <td className="p-4">{location.zone}</td>
                      <td className="p-4">{location.aisle}</td>
                      <td className="p-4">{location.bin}</td>
                      <td className="p-4 mono">{location.capacity || 'N/A'}</td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => handleEdit(location)} className="p-2 hover:bg-[#F4F4F6]" data-testid={`edit-location-${idx}`}>
                            <Pencil size={16} />
                          </button>
                          <button onClick={() => handleDelete(location.id)} className="p-2 hover:bg-[#F4F4F6] text-[#FF3B30]" data-testid={`delete-location-${idx}`}>
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
