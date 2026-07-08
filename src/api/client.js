import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Point this at your LAN IP when testing on a device.
export const API_BASE_HOST = 'http://10.0.2.2:4000';
export const API_BASE = `${API_BASE_HOST}/api`;

// Without a timeout, a real device that can't reach this LAN-only backend
// hangs on the OS TCP timeout (can be 60s+) before any offline-cache fallback
// kicks in — every screen that reads cached data would feel stuck loading.
const api = axios.create({ baseURL: API_BASE, timeout: 5000 });

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('sv_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
