import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { clearSession } from '../auth/session';

const API_PORT = 8000;

// Fallback only — used for standalone/production builds, where Expo reports no
// dev host. Keep it pointed at wherever the deployed API lives.
const FALLBACK_HOST = `http://192.168.100.83:${API_PORT}`;

// During development Metro runs on the SAME machine as the backend, and Expo
// hands us that machine's current LAN IP. Deriving the API host from it means
// a DHCP lease change no longer breaks the app — this address changed three
// times in a single day of testing, each time looking like a server outage
// ("could not reach server") when nothing was actually wrong.
//
// hostUri looks like "192.168.1.5:8081"; the older debuggerHost key is checked
// too since which one is populated varies by SDK and launch mode.
function inferDevHost() {
    const hostUri =
        Constants.expoConfig?.hostUri ||
        Constants.expoGoConfig?.debuggerHost ||
        Constants.manifest2?.extra?.expoClient?.hostUri;
    const host = hostUri?.split('/')[0]?.split(':')[0];
    return host ? `http://${host}:${API_PORT}` : null;
}

export const API_BASE_HOST = inferDevHost() || FALLBACK_HOST;
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

// A 401 means the token is gone/expired server-side — clear the stale
// identity locally (never the photos/spots tables) and tag the error so
// callers like syncEngine can abort cleanly instead of treating it as a
// per-request failure to retry.
function attachAuthInterceptor(instance) {
  instance.interceptors.response.use(
    (response) => response,
    async (error) => {
      if (error.response?.status === 401) {
        await clearSession();
        error.isAuthExpired = true;
      }
      return Promise.reject(error);
    }
  );
}
attachAuthInterceptor(api);

// The room/spot create+delete endpoints live on the web-facing router (no
// /mobile prefix, reused as-is from the web admin tooling) — this instance
// targets the bare host so those paths resolve correctly. Same auth header
// attached now so nothing needs touching once role checks land there later.
export const webApi = axios.create({ baseURL: API_BASE_HOST, timeout: 8000 });
webApi.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('sv_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
attachAuthInterceptor(webApi);

export default api;
