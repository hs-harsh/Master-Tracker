import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '../lib/api';

const AuthCtx = createContext(null);

function parseJwt(token) {
  try { return JSON.parse(atob(token.split('.')[1])); }
  catch { return {}; }
}

export function AuthProvider({ children }) {
  const [token, setToken]                       = useState(() => localStorage.getItem('token'));
  const [persons, setPersons]                   = useState([]);
  // null = not yet checked; true/false = known
  const [onboardingCompleted, setOnboardingCompleted] = useState(null);
  // Global person selection shared across all tabs
  const [activePerson, setActivePerson]         = useState('');
  // Incremented whenever transactions/investments are mutated — triggers Cashflow/Portfolio refresh
  const [dataVersion, setDataVersion]           = useState(0);
  const bumpDataVersion                         = () => setDataVersion(v => v + 1);

  const decoded    = token ? parseJwt(token) : {};
  const personName = decoded.personName || '';
  const isAdmin    = !!decoded.isAdmin;

  const fetchPersons = useCallback(async () => {
    try {
      const { data } = await api.get('/persons');
      setPersons(data);
    } catch {
      setPersons([]);
    }
  }, []);

  // Check onboarding status from settings
  const checkOnboarding = useCallback(async () => {
    try {
      const { data } = await api.get('/settings');
      setOnboardingCompleted(!!data.onboardingCompleted);
    } catch {
      // On error, don't block the app — treat as completed
      setOnboardingCompleted(true);
    }
  }, []);

  useEffect(() => {
    if (token) {
      fetchPersons();
      checkOnboarding();
    } else {
      setPersons([]);
      setActivePerson('');
      setOnboardingCompleted(null);
    }
  }, [token, fetchPersons, checkOnboarding]);

  // Auto-select first person when persons list loads
  useEffect(() => {
    if (persons.length && !activePerson) setActivePerson(persons[0]);
  }, [persons]);

  const _setToken = (t) => {
    if (t) localStorage.setItem('token', t);
    else localStorage.removeItem('token');
    setToken(t);
  };

  // Password-based login
  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    _setToken(data.token);
    return data;
  };

  // Password-based registration
  const register = async (email, password, pName) => {
    const { data } = await api.post('/auth/register', { email, password, personName: pName });
    _setToken(data.token);
    return data;
  };

  // OTP step 1: send code → returns { isNewUser, devOtp? }
  const sendOtp = async (email) => {
    const { data } = await api.post('/auth/send-otp', { email });
    return data;
  };

  // OTP step 2: verify code → logs in or creates account
  const verifyOtp = async (email, otp, pName) => {
    const { data } = await api.post('/auth/verify-otp', { email, otp, personName: pName });
    _setToken(data.token);
    return data;
  };

  const logout = () => _setToken(null);

  const completeOnboarding = async () => {
    await api.put('/settings', { onboardingCompleted: true });
    setOnboardingCompleted(true);
  };

  return (
    <AuthCtx.Provider value={{
      token, login, register, sendOtp, verifyOtp, logout,
      isAuth: !!token, personName, isAdmin,
      persons, fetchPersons,
      activePerson, setActivePerson,
      dataVersion, bumpDataVersion,
      onboardingCompleted, completeOnboarding,
    }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
