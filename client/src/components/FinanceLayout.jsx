import { Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  PieChart,
  Briefcase,
  TrendingUp,
  Receipt,
  Landmark,
} from 'lucide-react';
import SubTabBar from './SubTabBar';

const FINANCE_TABS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/portfolio', icon: PieChart, label: 'Portfolio' },
  { to: '/investments', icon: Briefcase, label: 'Investments' },
  { to: '/other-assets', icon: Landmark, label: 'Illiquid Investments' },
  { to: '/cashflow', icon: TrendingUp, label: 'Cashflow' },
  { to: '/transactions', icon: Receipt, label: 'Transactions' },
];

export default function FinanceLayout() {
  return (
    <div className="stack">
      <SubTabBar tabs={FINANCE_TABS} />
      <Outlet />
    </div>
  );
}
