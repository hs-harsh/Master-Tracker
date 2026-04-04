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
    if (err.response?.status === 401) {
      // Clear the token so useAuth re-evaluates and shows the inline login prompt
      localStorage.removeItem('token');
    }
    return Promise.reject(err);
  }
);

export default api;
