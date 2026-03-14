import { NavLink } from 'react-router-dom';
import { Utensils } from 'lucide-react';

const SUB_TABS = [
  { to: '/wellness/habits',  label: 'Habits' },
  { to: '/wellness/meals',   label: 'Meals',   icon: Utensils },
  { to: '/wellness/workouts', label: 'Workouts' },
];

export default function WellnessMeals() {
  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Sub-tab bar */}
      <div
        className="flex gap-1 p-1 rounded-xl flex-wrap"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {SUB_TABS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-body transition-all ${
                isActive ? 'bg-accent text-ink font-semibold' : 'text-soft hover:text-white'
              }`
            }
          >
            {Icon && <Icon size={16} />}
            {label}
          </NavLink>
        ))}
      </div>

      {/* Page header */}
      <div className="fade-up">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
          Meals
        </h1>
        <p className="text-muted text-xs mt-1 uppercase tracking-widest font-mono">
          Meal tracker & planner
        </p>
      </div>

      {/* Placeholder content */}
      <div className="card fade-up-1">
        <p className="text-muted text-sm">
          Plan and log your meals. Coming soon.
        </p>
      </div>
    </div>
  );
}
