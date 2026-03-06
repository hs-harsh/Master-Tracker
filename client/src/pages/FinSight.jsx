import { FileBarChart } from 'lucide-react';

export default function FinSight() {
  return (
    <div className="h-full flex flex-col bg-ink">
      {/* Header — no URL bar; Expense Tracker does not support app theme */}
      <header className="shrink-0 border-b border-border bg-surface/80 backdrop-blur-sm">
        <div className="px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center">
              <FileBarChart className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold text-white">Expense Tracker</h1>
              <p className="text-muted text-xs mt-0.5">Upload PDF statements · AI analysis · Reports</p>
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
