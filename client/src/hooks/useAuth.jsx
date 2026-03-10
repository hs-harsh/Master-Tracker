import { createContext, useContext, useState } from 'react';
import api from '../lib/api';

const AuthCtx = createContext(null);

function parseJwt(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return {};
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('token'));

  const personName = token ? (parseJwt(token).personName || '') : '';

  const login = async (username, password) => {
    const { data } = await api.post('/auth/login', { username, password });
    localStorage.setItem('token', data.token);
    setToken(data.token);
    return data;
  };

  const register = async (username, password, pName) => {
    const { data } = await api.post('/auth/register', { username, password, personName: pName });
    localStorage.setItem('token', data.token);
    setToken(data.token);
    return data;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
  };

  return (
    <AuthCtx.Provider value={{ token, login, register, logout, isAuth: !!token, personName }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
