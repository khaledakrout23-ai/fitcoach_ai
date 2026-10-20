import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// Adresse de l'API : on reprend l'adresse IP du PC qui lance "expo start"
// (le téléphone et le PC doivent être sur le même Wi-Fi).
// Si cela ne marche pas, écrivez l'adresse à la main, ex. 'http://192.168.1.15:4000/api'.
const MANUAL_API_URL = null;

function detectApiUrl() {
  if (MANUAL_API_URL) return MANUAL_API_URL;
  const host = Constants.expoConfig?.hostUri || Constants.expoGoConfig?.debuggerHost || '';
  const ip = host.split(':')[0];
  return ip ? `http://${ip}:4000/api` : 'http://10.0.2.2:4000/api'; // 10.0.2.2 = PC vu depuis l'émulateur Android
}

export const API_URL = detectApiUrl();
// Site web (Vite, port 5173) sur le même PC : utilisé pour l'espace gérant / administrateur
export const WEB_URL = API_URL.replace(/:\d+\/api$/, ':5173');
const TOKEN_KEY = 'fitcoach_token';
let token = null;

export async function loadToken() {
  token = await AsyncStorage.getItem(TOKEN_KEY);
  return token;
}

export const getToken = () => token;

export async function setToken(value) {
  token = value;
  if (value) await AsyncStorage.setItem(TOKEN_KEY, value);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', `Serveur injoignable (${API_URL}).`);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.code || 'ERROR', data?.message || 'Erreur.');
  return data;
}
