import { Outlet } from 'react-router-dom';
import { TrendingUp, BarChart2 } from 'lucide-react';
import SubTabBar from './SubTabBar';

/**
 * The one declaration of the live-trading sub-nav. It was previously an
 * identical local `SUB_TABS` const plus an identical bar+divider block in both
 * BacktestPage and PostTradePage — the same duplication AC-3.3 removed for
 * wellness.
 */
const LIVE_TRADING_TABS = [
  { to: '/live-trading/backtest',   label: 'Backtest',   icon: TrendingUp },
  { to: '/live-trading/post-trade', label: 'Post-Trade', icon: BarChart2  },
];

export default function LiveTradingLayout() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="pb-4 shrink-0">
        <SubTabBar tabs={LIVE_TRADING_TABS} />
      </div>
      <div className="h-px shrink-0 bg-hairline/10" />
      {/* min-h-0 so the pages' `h-full` split panes resolve against a definite
          height rather than overflowing this column. */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
