import { Inbox } from 'lucide-react';

/**
 * EmptyState — the one way this app says "there's nothing here".
 *
 * There were 25+ ad-hoc strings before this, and they disagreed on almost
 * every axis: "No assets yet" vs "No trades" vs "No broker data" vs "No
 * investments yet" (twice, in two different pages, styled differently) vs "No
 * habit data yet for this period". Some were a bare centred <td>, some a <p>,
 * some had a call to action and some left you stuck. Several were `text-muted`
 * on a card with no icon, which at 375px reads as a rendering failure rather
 * than an intentional state.
 *
 * ── The voice ────────────────────────────────────────────────────────────────
 * Two props, and the distinction between them is the whole point:
 *
 *   title  what is absent, as a noun phrase — "No transactions yet"
 *   hint   the single next action, as an imperative — "Add one to get started."
 *
 * Never put the reason in the title or the noun in the hint. Two shapes only:
 *
 *   nothing exists yet →  title "No <things> yet"          hint: how to make one
 *   filters excluded   →  title "No <things> match ..."    hint: how to widen
 *
 * The second shape matters: "No transactions found" used to be shown both when
 * the account was empty and when a filter hid everything, so the one case the
 * user could fix looked identical to the one they couldn't.
 *
 * ── Props ────────────────────────────────────────────────────────────────────
 *   icon    lucide-react component (not an element) — defaults to Inbox
 *   title   required noun phrase
 *   hint    optional one-liner; keep it to one sentence
 *   action  optional node, usually a .btn-primary or a plain text button
 *   compact tighter padding, for empty states inside a small card or a chart
 *           slot rather than a full page body
 *
 * Colours come from the neutral ramp tokens, so this is legible in both themes
 * with no theme-specific styling of its own.
 */
export default function EmptyState({
  icon: Icon = Inbox,
  title,
  hint,
  action,
  compact = false,
  className = '',
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? 'py-8 px-4' : 'py-14 px-6'
      } ${className}`}
    >
      <div
        className={`flex items-center justify-center rounded-full mb-3 ${
          compact ? 'w-9 h-9' : 'w-12 h-12'
        }`}
        style={{ background: 'rgb(var(--fg-muted-rgb) / 0.10)' }}
      >
        <Icon size={compact ? 16 : 20} className="text-muted" strokeWidth={1.75} />
      </div>

      <p className={`text-soft ${compact ? 'text-[13px]' : 'text-sm'} font-medium`}>
        {title}
      </p>

      {hint && (
        <p className="text-muted text-xs mt-1 max-w-[38ch] leading-relaxed">{hint}</p>
      )}

      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * Table-shaped wrapper. A bare <EmptyState> inside a <tbody> is invalid markup
 * and browsers hoist it out of the table, which is why some of the old empty
 * states rendered above their own card. Use this instead inside a table:
 *
 *   <EmptyRow colSpan={7} title="No transactions yet" hint="…" />
 */
export function EmptyRow({ colSpan, ...props }) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        <EmptyState {...props} />
      </td>
    </tr>
  );
}
