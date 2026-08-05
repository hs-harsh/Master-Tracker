import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 190000,
});

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401 && localStorage.getItem('token')) {
      // Session expired or invalid — sync React auth state via useAuth listener
      localStorage.removeItem('token');
      window.dispatchEvent(new Event('auth:unauthorized'));
    }
    return Promise.reject(err);
  }
);

export default api;
