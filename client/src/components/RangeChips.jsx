/**
 * Compact range / period selector — the `3M 6M 1Y … ALL` and `1M 3M 1Y` chip
 * groups that sit inside a card header or beside a PageHeader.
 *
 * Neutral for the same reason SubTabBar and SegmentedToggle are: this is the
 * *smallest* control in the hierarchy, so an accent fill here made an in-card
 * range picker louder than the page-level toggle above it. Four byte-identical
 * copies of this markup had already drifted apart across Habits, Workouts,
 * Cashflow and Dashboard.
 *
 * `options` is a plain array of strings — these labels are the value.
 */
export default function RangeChips({ options, value, onChange, className = '' }) {
  return (
    <div
      className={`flex gap-1 rounded-lg overflow-hidden border border-hairline/10 ${className}`}
    >
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={`px-3 py-1.5 text-xs transition-colors ${
            value === o
              ? 'bg-card text-text font-semibold'
              : 'text-soft hover:text-text bg-hairline/[0.03] font-medium'
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
