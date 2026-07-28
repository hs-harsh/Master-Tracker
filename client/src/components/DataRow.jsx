/**
 * DataRow — the app's list-row pattern, in one place.
 *
 * Anatomy, left to right:
 *
 *   [chip]  Name                                    ₹1,20,000
 *           dim sub-label                              +2.4%
 *   └─ identity ─┘                          └─ mono, right-aligned ─┘
 *
 * The two halves have different jobs and therefore different type. The left is
 * an identifier you read: body font, full contrast on the name, one dim line
 * under it for the things that qualify it (account, broker, date). The right is
 * a figure you compare down a column: mono and tabular-nums so digits line up
 * row to row, right-aligned so the units do too, with the delta beneath in the
 * semantic gain/loss colour.
 *
 * Getting that alignment by hand is exactly what went wrong before — the same
 * conceptual row was built three ways across Portfolio, OtherAssets and
 * Dashboard, with the value sometimes left-aligned, sometimes proportional
 * font, so columns of currency visibly failed to line up.
 *
 * ── Props ────────────────────────────────────────────────────────────────────
 *   chip     node — a <span className="tag …">, ticker badge or colour dot
 *   name     required; the primary identifier
 *   sub      dim qualifier line under the name
 *   value    the figure. Pass a formatted string — this does no formatting,
 *            because currency conversion has to happen before it gets here.
 *   delta    node or string, rendered under the value
 *   tone     'pos' | 'neg' | 'muted' — colour for `delta`. Omit and it is
 *            inferred from a leading +/− in a string delta.
 *   onClick  makes the row a button (keyboard-focusable, 44px min height)
 *   right    escape hatch: replaces the whole right side (e.g. action icons)
 */
export default function DataRow({
  chip,
  name,
  sub,
  value,
  delta,
  tone,
  onClick,
  right,
  className = '',
}) {
  // A string delta carries its own sign, so the common case needs no `tone`.
  const resolvedTone =
    tone ??
    (typeof delta === 'string'
      ? delta.trim().startsWith('-') || delta.trim().startsWith('−')
        ? 'neg'
        : delta.trim().startsWith('+')
          ? 'pos'
          : 'muted'
      : 'muted');

  const toneClass = { pos: 'text-pos', neg: 'text-neg', muted: 'text-muted' }[resolvedTone];

  const body = (
    <>
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {chip}
        <div className="min-w-0">
          <p className="text-text text-sm font-medium truncate">{name}</p>
          {sub && <p className="text-muted text-xs truncate mt-0.5">{sub}</p>}
        </div>
      </div>

      {right ?? (
        <div className="text-right shrink-0 pl-3">
          {value != null && <p className="mono-data text-text text-[13px]">{value}</p>}
          {delta != null && <p className={`mono-data text-[11px] mt-0.5 ${toneClass}`}>{delta}</p>}
        </div>
      )}
    </>
  );

  const base = `flex items-center justify-between gap-2 w-full py-2.5 ${className}`;

  if (!onClick) return <div className={base}>{body}</div>;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} min-h-[44px] text-left rounded-lg px-2 -mx-2 transition-colors hover:bg-surface/40`}
    >
      {body}
    </button>
  );
}
