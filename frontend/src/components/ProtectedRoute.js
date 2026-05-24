import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export const ProtectedRoute = ({ children, adminOnly = false }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F4F6]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#002FA7] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-[#737373] uppercase tracking-wide font-semibold">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || user === false) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && user.role !== 'admin') {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
};
