/**
 * The canonical page title block: display title + mono-uppercase eyebrow,
 * with an optional actions cluster on the right.
 *
 * Authored against the type ramp rather than restating size/weight/tracking —
 * `.type-display-lg` for the title, `.label` for the eyebrow. `.label` is mono
 * as of Phase 2, which is what the hand-rolled `font-mono uppercase` subtitle
 * on Dashboard/wellness already was; the pages that used a plain `text-sm`
 * subtitle now match them.
 *
 * Props:
 *   title    — string or node (pages interpolate the active person's name)
 *   eyebrow  — short subtitle, rendered mono/uppercase under the title
 *   actions  — buttons/toggles that belong beside the title
 */
export default function PageHeader({ title, eyebrow, actions, className = '' }) {
  return (
    <div className={`flex flex-wrap items-start justify-between gap-3 sm:gap-4 ${className}`}>
      <div className="min-w-0">
        <h1 className="type-display-lg">{title}</h1>
        {eyebrow && <p className="label mt-1.5 mb-0">{eyebrow}</p>}
      </div>
      {actions && <div className="flex items-center gap-3 flex-wrap">{actions}</div>}
    </div>
  );
}
