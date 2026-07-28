import { useLocation, useNavigate } from 'react-router-dom';
import { Wallet, Heart } from 'lucide-react';

const SECTIONS = [
  { key: 'finance',  label: 'Finance',  icon: Wallet, to: '/dashboard',       active: p => !p.startsWith('/wellness') },
  { key: 'wellness', label: 'Wellness', icon: Heart,  to: '/wellness/habits', active: p => p.startsWith('/wellness') },
];

/**
 * Chrome-style raised section tabs for mobile only.
 *
 * -mx-4 -mt-4 breaks out of each page/layout's p-4 so the strip runs
 * edge-to-edge. Hidden on md+ where the sidebar handles section switching.
 *
 * Active tab: slightly elevated surface bg + accent top line + no bottom
 * border so it visually "connects" to the content below.
 * Inactive tab: transparent, muted — appears recessed.
 */
export default function MobileSectionSwitcher() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  return (
    <div
      className="md:hidden -mx-4 -mt-4 flex"
      style={{ borderBottom: '1px solid rgb(var(--hairline-rgb) / 0.15)' }}
    >
      {SECTIONS.map(({ key, label, icon: Icon, to, active }) => {
        const isActive = active(pathname);
        return (
          <button
            key={key}
            type="button"
            onClick={() => { if (!isActive) navigate(to); }}
            className={`relative flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-semibold transition-colors min-h-[52px] ${
              isActive ? 'text-text' : 'text-muted hover:text-soft'
            }`}
            style={isActive ? {
              background: 'rgb(var(--surface-rgb))',
              borderLeft:   '1px solid rgb(var(--hairline-rgb) / 0.15)',
              borderTop:    '1px solid rgb(var(--hairline-rgb) / 0.15)',
              borderRight:  '1px solid rgb(var(--hairline-rgb) / 0.15)',
              borderBottom: '1px solid rgb(var(--surface-rgb))',
              borderRadius: '12px 12px 0 0',
              marginBottom: '-1px',
            } : {}}
          >
            {/* Accent top line — only on active tab */}
            {isActive && (
              <span
                className="absolute inset-x-0 top-0 h-[3px]"
                style={{ background: 'var(--accent)', borderRadius: '12px 12px 0 0' }}
              />
            )}
            <Icon size={17} className="shrink-0" />
            <span className="tracking-wide">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
