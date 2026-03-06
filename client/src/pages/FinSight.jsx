import { FileBarChart, ExternalLink } from 'lucide-react';

export default function FinSight() {
  const appUrl = `${window.location.origin}/finsight/`;

  return (
    <div className="h-full flex flex-col bg-ink">
      {/* Header */}
      <header className="shrink-0 border-b border-border bg-surface/80 backdrop-blur-sm">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center">
                <FileBarChart className="w-5 h-5 text-accent" />
              </div>
              <div>
                <h1 className="font-display text-xl font-bold text-white">Expense Tracker</h1>
                <p className="text-muted text-xs mt-0.5">Upload PDF statements · AI analysis · Reports</p>
              </div>
            </div>
            <div className="flex items-center gap-2 min-w-0 max-w-xl flex-1">
              <div className="flex-1 flex items-center gap-2 rounded-lg bg-card border border-border px-3 py-2 font-mono text-xs text-soft truncate">
                <span className="text-muted shrink-0">URL</span>
                <span className="truncate" title={appUrl}>{appUrl}</span>
              </div>
              <a
                href="/finsight/"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs"
                title="Open in new tab"
              >
                <ExternalLink size={14} />
                New tab
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Embedded app */}
      <div className="flex-1 min-h-0 p-4 md:p-6">
        <div className="h-full rounded-xl border border-border bg-card overflow-hidden shadow-lg">
          <iframe
            title="Expense Tracker — Household Finance Analyzer"
            src="/finsight/"
            className="w-full h-full min-h-[480px] border-0 rounded-xl"
          />
        </div>
      </div>
    </div>
  );
}
