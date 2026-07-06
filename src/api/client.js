import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Point this at your LAN IP when testing on a device.
export const API_BASE_HOST = 'http://10.0.2.2:4000';
export const API_BASE = `${API_BASE_HOST}/api`;

const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('sv_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
