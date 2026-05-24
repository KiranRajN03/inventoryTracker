import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

const API_URL = process.env.REACT_APP_BACKEND_URL;

function formatApiErrorDetail(detail) {
  if (detail == null) return 'Something went wrong. Please try again.';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === 'string' ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(' ');
  if (detail && typeof detail.msg === 'string') return detail.msg;
  return String(detail);
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/auth/me`, {
        withCredentials: true,
      });
      setUser(data);
    } catch (err) {
      setUser(false);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      setError('');
      const { data } = await axios.post(
        `${API_URL}/api/auth/login`,
        { email, password },
        { withCredentials: true }
      );
      setUser(data);
      return data;
    } catch (e) {
      const errMsg = formatApiErrorDetail(e.response?.data?.detail) || e.message;
      setError(errMsg);
      throw new Error(errMsg);
    }
  };

  const register = async (email, password, name, role = 'worker') => {
    try {
      setError('');
      const { data } = await axios.post(
        `${API_URL}/api/auth/register`,
        { email, password, name, role },
        { withCredentials: true }
      );
      setUser(data);
      return data;
    } catch (e) {
      const errMsg = formatApiErrorDetail(e.response?.data?.detail) || e.message;
      setError(errMsg);
      throw new Error(errMsg);
    }
  };

  const logout = async () => {
    try {
      await axios.post(`${API_URL}/api/auth/logout`, {}, { withCredentials: true });
      setUser(false);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, login, register, logout, setError }}>
      {children}
    </AuthContext.Provider>
  );
};
