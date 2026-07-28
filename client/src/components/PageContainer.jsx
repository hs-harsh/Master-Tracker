/**
 * The single place the app's page width and gutters are defined.
 *
 * Applied once, in Layout around the router <Outlet>, so no page carries its
 * own `p-4 sm:p-6` any more. Before this, <main> had neither a max-width nor
 * padding, so dense tables ran edge to edge on a wide monitor.
 *
 * It is a flex column that grows: the full-height pages (live trading's split
 * panes) use `h-full` on their root, which only resolves against a parent with
 * a definite height — `flex-1 min-h-0` inside the flex-col <main> gives them
 * one. Ordinary pages are unaffected; their root is a normal block-ish flex
 * item at auto height.
 */
export default function PageContainer({ children, className = '' }) {
  return (
    <div
      className={`w-full max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6 flex flex-col flex-1 min-h-0 ${className}`}
    >
      {children}
    </div>
  );
}
