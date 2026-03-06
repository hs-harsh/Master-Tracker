import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Cashflow from './pages/Cashflow';
import Transactions from './pages/Transactions';
import Portfolio from './pages/Portfolio';
import Investments from './pages/Investments';
import ExpenseAnalyser from './pages/ExpenseAnalyser';
import Trade from './pages/Trade';
import StockTrade from './pages/StockTrade';
import Settings from './pages/Settings';

function ProtectedOutlet() {
  const { isAuth } = useAuth();
  return isAuth ? <Outlet /> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          {/* All pages share the same Layout */}
          <Route path="/" element={<Layout />}>
            {/* Public — no login required */}
            <Route path="trade" element={<Trade />} />
            <Route path="stock-trade" element={<StockTrade />} />
            {/* Private — redirects to /login if not authenticated */}
            <Route element={<ProtectedOutlet />}>
              <Route index element={<Dashboard />} />
              <Route path="portfolio" element={<Portfolio />} />
              <Route path="investments" element={<Investments />} />
              <Route path="cashflow" element={<Cashflow />} />
              <Route path="transactions" element={<Transactions />} />
              <Route path="expense-analyser" element={<ExpenseAnalyser />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
