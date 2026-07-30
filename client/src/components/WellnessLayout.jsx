import { Outlet } from 'react-router-dom';
import { CheckSquare, Utensils, Dumbbell } from 'lucide-react';
import SubTabBar from './SubTabBar';

/**
 * The one declaration of the wellness sub-nav. It used to be copy-pasted as a
 * local `SUB_TABS` const into each of the three wellness pages, along with the
 * bar's markup.
 */
const WELLNESS_TABS = [
  { to: '/wellness/habits',   label: 'Habits',   icon: CheckSquare },
  { to: '/wellness/workouts', label: 'Workouts', icon: Dumbbell    },
  { to: '/wellness/meals',    label: 'Meals',    icon: Utensils    },
];

export default function WellnessLayout() {
  return (
    <div className="stack">
      <SubTabBar tabs={WELLNESS_TABS} />
      <Outlet />
    </div>
  );
}
