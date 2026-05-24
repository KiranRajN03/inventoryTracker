import "@/App.css";
import "@/index.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { Products } from './pages/Products';
import { Locations } from './pages/Locations';
import { StockLedger } from './pages/StockLedger';
import { Worker } from './pages/Worker';
import { Unauthorized } from './pages/Unauthorized';
import { Toaster } from 'sonner';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/unauthorized" element={<Unauthorized />} />
          
          <Route path="/dashboard" element={
            <ProtectedRoute adminOnly>
              <Dashboard />
            </ProtectedRoute>
          } />
          
          <Route path="/products" element={
            <ProtectedRoute adminOnly>
              <Products />
            </ProtectedRoute>
          } />
          
          <Route path="/locations" element={
            <ProtectedRoute adminOnly>
              <Locations />
            </ProtectedRoute>
          } />
          
          <Route path="/stock-ledger" element={
            <ProtectedRoute adminOnly>
              <StockLedger />
            </ProtectedRoute>
          } />
          
          <Route path="/worker" element={
            <ProtectedRoute>
              <Worker />
            </ProtectedRoute>
          } />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </AuthProvider>
  );
}

export default App;
