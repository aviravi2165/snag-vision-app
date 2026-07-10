import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Point this at your PC's LAN IP when testing on a real device via Expo Go —
// phone and PC must be on the same WiFi. 10.0.2.2 only resolves inside the
// Android emulator's loopback, never on a physical phone.
export const API_BASE_HOST = 'http://192.168.100.7:8000';
// The backend routers are mounted bare (no /api prefix) — /mobile/* is the
// namespace built specifically for this app; the web app's own endpoints
// live at other paths on this same server and are untouched by this app.
export const API_BASE = `${API_BASE_HOST}/mobile`;

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
