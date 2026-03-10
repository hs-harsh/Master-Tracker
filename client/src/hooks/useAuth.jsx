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
      setOnboardingCompleted(null);
    }
  }, [token, fetchPersons, checkOnboarding]);

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

  // Called after the onboarding wizard saves defaults
  const completeOnboarding = async (defaults, year) => {
    await api.put('/settings', {
      defaultIncome:          Number(defaults.income)         || 0,
      defaultIdealSaving:     Number(defaults.idealSaving)    || 0,
      defaultRegularExpense:  Number(defaults.regularExpense) || 0,
      defaultEmi:             Number(defaults.emi)            || 0,
      onboardingCompleted:    true,
    });
    // Seed all months for the given year
    await api.post('/settings/apply-year-defaults', { year });
    setOnboardingCompleted(true);
  };

  return (
    <AuthCtx.Provider value={{
      token, login, register, sendOtp, verifyOtp, logout,
      isAuth: !!token, personName, isAdmin,
      persons, fetchPersons,
      onboardingCompleted, completeOnboarding,
    }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
