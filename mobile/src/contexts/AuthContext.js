import React, { createContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../utils/api';
import { initDatabase } from '../utils/database';
import { pullFreshMasterData } from '../utils/syncQueue';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Check login state on start
  useEffect(() => {
    const bootstrapAsync = async () => {
      try {
        // 1. Initialize SQLite Database
        await initDatabase();

        const token = await AsyncStorage.getItem('access_token');
        if (token) {
          // Verify token against /auth/me
          const response = await api.get('/auth/me');
          if (response.status === 200) {
            setUser(response.data);
            setIsAuthenticated(true);
            
            // Pop cache on success
            await pullFreshMasterData();
          } else {
            await logout();
          }
        }
      } catch (e) {
        console.log('No valid session found during startup verification', e);
        // If server is offline but token exists, we can allow offline access!
        const savedUserStr = await AsyncStorage.getItem('user_profile');
        if (savedUserStr) {
          try {
            setUser(JSON.parse(savedUserStr));
            setIsAuthenticated(true);
            console.log('Authenticated in offline recovery mode using cached credentials');
          } catch (_) {}
        }
      } finally {
        setIsLoading(false);
      }
    };

    bootstrapAsync();
  }, []);

  const login = async (email, password) => {
    setIsLoading(true);
    try {
      const response = await api.post('/auth/login', { email, password });
      if (response.status === 200) {
        const userData = response.data;
        const token = userData.access_token;
        
        await AsyncStorage.setItem('access_token', token);
        await AsyncStorage.setItem('user_profile', JSON.stringify(userData));
        
        setUser(userData);
        setIsAuthenticated(true);

        // Pre-fetch catalog data for SQLite cache right after login
        try {
          await pullFreshMasterData();
        } catch (err) {
          console.log('Unable to perform initial database cache pull, running offline only', err);
        }

        setIsLoading(false);
        return { success: true };
      }
    } catch (error) {
      setIsLoading(false);
      const msg = error.response?.data?.detail || 'Authentication failed. Please verify credentials.';
      return { success: false, error: msg };
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await api.post('/auth/logout');
    } catch (e) {
      console.log('Logout call failed or network offline, cleaning state locally', e);
    }
    
    await AsyncStorage.removeItem('access_token');
    await AsyncStorage.removeItem('user_profile');
    
    setUser(null);
    setIsAuthenticated(false);
    setIsLoading(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
