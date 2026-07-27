/**
 * In-page segmented control (the "Plan Week / Analytics" style toggles that sit
 * beside a PageHeader title).
 *
 * Same neutral chip treatment as SubTabBar: these live one level *below* the
 * sub-tab bar, so if they kept the old `bg-accent text-ink` fill they would
 * out-shout the section nav above them and invert the hierarchy. Identical
 * markup was repeated in all three wellness pages.
 */
export default function SegmentedToggle({ options, value, onChange, className = '' }) {
  return (
    <div className={`flex gap-1 p-1 rounded-xl bg-hairline/[0.04] border border-hairline/10 ${className}`}>
      {options.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`px-4 py-2 rounded-lg text-sm font-body transition-all ${
            value === key
              ? 'bg-card text-text font-semibold ring-1 ring-inset ring-hairline/15'
              : 'text-soft hover:text-text'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
