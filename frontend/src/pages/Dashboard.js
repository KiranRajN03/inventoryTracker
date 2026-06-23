import { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '@/lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Package, MapPin, AlertTriangle, Activity, LogOut } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Button } from '../components/ui/button';

export const Dashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [lowStockAlerts, setLowStockAlerts] = useState([]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [statsRes, alertsRes, ledgerRes] = await Promise.all([
        axios.get(`${API_URL}/api/dashboard/stats`, { withCredentials: true }),
        axios.get(`${API_URL}/api/dashboard/low-stock`, { withCredentials: true }),
        axios.get(`${API_URL}/api/stock/ledger?limit=10`, { withCredentials: true }),
      ]);
      setStats(statsRes.data);
      setLowStockAlerts(alertsRes.data);
      setRecentTransactions(ledgerRes.data);
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    } finally {
      setLoading(false);
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
          <p className="text-sm text-[#737373] uppercase tracking-wide font-semibold">Loading Dashboard...</p>
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

      {/* Sidebar + Main Content */}
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-[#E5E5E5] min-h-[calc(100vh-73px)] p-6">
          <nav className="space-y-2">
            <button
              onClick={() => navigate('/dashboard')}
              className="w-full text-left px-4 py-3 text-sm font-semibold bg-[#002FA7] text-white hover:bg-[#001F70]"
              data-testid="nav-dashboard"
            >
              Dashboard
            </button>
            <button
              onClick={() => navigate('/products')}
              className="w-full text-left px-4 py-3 text-sm font-semibold hover:bg-[#F4F4F6]"
              data-testid="nav-products"
            >
              Products
            </button>
            <button
              onClick={() => navigate('/locations')}
              className="w-full text-left px-4 py-3 text-sm font-semibold hover:bg-[#F4F4F6]"
              data-testid="nav-locations"
            >
              Locations
            </button>
            <button
              onClick={() => navigate('/stock-ledger')}
              className="w-full text-left px-4 py-3 text-sm font-semibold hover:bg-[#F4F4F6]"
              data-testid="nav-ledger"
            >
              Stock Ledger
            </button>
            <button
              onClick={() => navigate('/worker')}
              className="w-full text-left px-4 py-3 text-sm font-semibold hover:bg-[#F4F4F6]"
              data-testid="nav-worker"
            >
              Warehouse Floor
            </button>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6">
          <div className="mb-6">
            <h2 className="text-3xl font-black tracking-tighter mb-2" style={{fontFamily: 'Cabinet Grotesk, sans-serif'}}>Dashboard Overview</h2>
            <p className="text-sm text-[#737373]">Real-time inventory metrics and alerts</p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white border border-[#E5E5E5] p-6" data-testid="stat-products">
              <div className="flex items-center justify-between mb-4">
                <Package size={24} className="text-[#002FA7]" />
                <span className="text-xs uppercase tracking-wider font-bold text-[#737373]">Products</span>
              </div>
              <div className="text-3xl font-black mono">{stats?.total_products || 0}</div>
            </div>

            <div className="bg-white border border-[#E5E5E5] p-6" data-testid="stat-locations">
              <div className="flex items-center justify-between mb-4">
                <MapPin size={24} className="text-[#002FA7]" />
                <span className="text-xs uppercase tracking-wider font-bold text-[#737373]">Locations</span>
              </div>
              <div className="text-3xl font-black mono">{stats?.total_locations || 0}</div>
            </div>

            <div className="bg-white border border-[#E5E5E5] p-6" data-testid="stat-stock">
              <div className="flex items-center justify-between mb-4">
                <Package size={24} className="text-[#34C759]" />
                <span className="text-xs uppercase tracking-wider font-bold text-[#737373]">Total Stock</span>
              </div>
              <div className="text-3xl font-black mono">{stats?.total_stock || 0}</div>
            </div>

            <div className="bg-white border border-[#E5E5E5] p-6" data-testid="stat-alerts">
              <div className="flex items-center justify-between mb-4">
                <AlertTriangle size={24} className="text-[#FF3B30]" />
                <span className="text-xs uppercase tracking-wider font-bold text-[#737373]">Low Stock</span>
              </div>
              <div className="text-3xl font-black mono">{stats?.low_stock_count || 0}</div>
            </div>
          </div>

          {/* Low Stock Alerts */}
          {lowStockAlerts.length > 0 && (
            <div className="bg-white border border-[#E5E5E5] p-6 mb-6" data-testid="low-stock-alerts">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle size={20} className="text-[#FF3B30]" />
                <h3 className="text-xl font-bold tracking-tight">Low Stock Alerts</h3>
              </div>
              <div className="space-y-2">
                {lowStockAlerts.slice(0, 5).map((alert, idx) => (
                  <div key={idx} className="flex items-center justify-between py-3 border-b border-[#E5E5E5] last:border-0" data-testid={`alert-item-${idx}`}>
                    <div>
                      <div className="font-semibold">{alert.product_name}</div>
                      <div className="text-sm mono text-[#737373]">SKU: {alert.sku}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[#FF3B30] font-bold mono">{alert.current_stock} units</div>
                      <div className="text-xs text-[#737373]">Threshold: {alert.threshold}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Transactions */}
          <div className="bg-white border border-[#E5E5E5] p-6" data-testid="recent-transactions">
            <div className="flex items-center gap-2 mb-4">
              <Activity size={20} className="text-[#002FA7]" />
              <h3 className="text-xl font-bold tracking-tight">Recent Transactions</h3>
            </div>
            <div className="space-y-2">
              {recentTransactions.length === 0 ? (
                <p className="text-sm text-[#737373] py-4">No transactions yet</p>
              ) : (
                recentTransactions.map((tx, idx) => (
                  <div key={idx} className="flex items-center justify-between py-3 border-b border-[#E5E5E5] last:border-0" data-testid={`transaction-item-${idx}`}>
                    <div>
                      <div className="font-semibold text-sm">{tx.transaction_type}</div>
                      <div className="text-xs text-[#737373]">{new Date(tx.timestamp).toLocaleString()}</div>
                    </div>
                    <div className="mono font-bold">{tx.quantity_change > 0 ? '+' : ''}{tx.quantity_change}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};
