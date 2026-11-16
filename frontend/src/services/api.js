import axios from 'axios';
import { clean } from '../utils/misc';

export const http = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1', withCredentials: true, timeout: 20000 });

let csrfToken = null;
let onUnauthorized = null;
export const setCsrfToken = (t) => { csrfToken = t; };
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

http.interceptors.request.use((config) => {
  if (csrfToken && config.method && config.method.toLowerCase() !== 'get') config.headers['X-CSRF-Token'] = csrfToken;
  return config;
});

function normalize(err) {
  const body = err.response?.data?.error;
  return { status: err.response?.status || 0, code: body?.code || (err.code === 'ECONNABORTED' ? 'TIMEOUT' : 'NETWORK_ERROR'), message: body?.message || err.message, details: body?.details };
}

http.interceptors.response.use((r) => r, (err) => {
  const e = normalize(err);
  if (e.status === 401 && !String(err.config?.url).includes('/auth/login') && onUnauthorized) onUnauthorized();
  return Promise.reject(e);
});

const unwrap = (r) => ({ data: r.data.data, meta: r.data.meta });
export const api = {
  get: (url, params) => http.get(url, { params: params ? clean(params) : undefined }).then(unwrap),
  post: (url, body) => http.post(url, body).then(unwrap),
  patch: (url, body) => http.patch(url, body).then(unwrap),
  put: (url, body) => http.put(url, body).then(unwrap),
  del: (url) => http.delete(url).then(unwrap),
};
