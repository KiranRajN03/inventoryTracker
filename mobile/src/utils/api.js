import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Default target to local uvicorn instance
const API_BASE_URL = 'http://192.168.29.54:8000/api'; // Target local machine IP for physical testing

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Automatically inject Bearer authentication tokens if present in mobile storage
api.interceptors.request.use(
  async (config) => {
    try {
      const token = await AsyncStorage.getItem('access_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (e) {
      console.error('Failed to read access token from AsyncStorage', e);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default api;
export { API_BASE_URL };
