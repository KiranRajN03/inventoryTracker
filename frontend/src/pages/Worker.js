import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { LogOut, ScanLine, Package, CheckCircle } from 'lucide-react';

export const Worker = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#F4F4F6]">
      <header className="bg-white border-b border-[#E5E5E5] sticky top-0 z-10">
        <div className="px-6 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-black tracking-tighter" style={{fontFamily: 'Cabinet Grotesk, sans-serif'}}>Warehouse Floor</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-[#737373]">{user?.name}</span>
            <Button onClick={handleLogout} variant="outline" size="sm" className="border-[#E5E5E5] rounded-none" data-testid="logout-button">
              <LogOut size={16} className="mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="p-6 max-w-2xl mx-auto">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-black tracking-tighter mb-2" style={{fontFamily: 'Cabinet Grotesk, sans-serif'}}>Mobile App Coming Soon</h2>
          <p className="text-[#737373]">The React Native mobile app for floor workers is under development.</p>
        </div>

        <div className="grid gap-4">
          <div className="bg-white border border-[#E5E5E5] p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-[#F4F4F6] flex items-center justify-center">
                <Package size={24} className="text-[#002FA7]" />
              </div>
              <div>
                <h3 className="text-xl font-bold">Receive Stock</h3>
                <p className="text-sm text-[#737373]">Scan barcode to receive inventory</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#E5E5E5] p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-[#F4F4F6] flex items-center justify-center">
                <ScanLine size={24} className="text-[#002FA7]" />
              </div>
              <div>
                <h3 className="text-xl font-bold">Pick Stock</h3>
                <p className="text-sm text-[#737373]">Scan and pick items for orders</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#E5E5E5] p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-[#F4F4F6] flex items-center justify-center">
                <CheckCircle size={24} className="text-[#002FA7]" />
              </div>
              <div>
                <h3 className="text-xl font-bold">Cycle Count</h3>
                <p className="text-sm text-[#737373]">Audit and reconcile inventory</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 p-6 bg-[#FFCC00] border border-[#E5E5E5]">
          <p className="text-sm font-semibold">⚠️ Note: The full mobile experience with barcode scanning, offline sync, and SQLite storage will be available in the React Native app.</p>
        </div>
      </main>
    </div>
  );
};
