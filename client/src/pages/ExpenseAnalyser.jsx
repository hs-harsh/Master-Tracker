import { useCallback, useEffect, useRef, useState } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import api from '../lib/api';
import { fmt, fmtFull } from '../lib/utils';
import { Plus, Trash2, ChevronDown, ChevronRight, FileText, Loader2 } from 'lucide-react';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const formatMonthLabel = (ym) => {
  if (!ym) return 'Current Month';
  const [y, m] = String(ym).split('-');
  return `${MONTHS[+(m || 1) - 1]} ${y || ''}`;
};

function loadPdfScript() {
  return new Promise((resolve) => {
    if (window.pdfjsLib) {
      resolve(window.pdfjsLib);
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve(window.pdfjsLib);
    };
    document.head.appendChild(s);
  });
}

async function extractPdfText(file) {
  const pdfjsLib = await loadPdfScript();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => it.str).join(' ') + '\n';
  }
  return text;
}

function robustParseJSON(raw) {
  raw = String(raw).trim();
  try {
    return JSON.parse(raw);
  } catch (_) {}
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (_) {}
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('No JSON found in response');
  let block = raw.slice(start, end + 1);
  try {
    return JSON.parse(block);
  } catch (_) {}
  block = block.replace(/,(\s*[}\]])/g, '$1').replace(/[\u0000-\u001F\u007F]/g, ' ');
  try {
    return JSON.parse(block);
  } catch (_) {}
  throw new Error('Could not parse AI response.');
}

function buildSingleFilePrompt(slot, statementMonth) {
  const monthLabel = formatMonthLabel(statementMonth);
  const personName = slot.person === 'harsh' ? 'Harsh Kumar' : 'Kirti Verma';
  return `You are a professional financial analyst. Analyze this single bank/credit card statement for ${personName}.

STATEMENT: ${slot.label}
PERSON: ${personName}
MONTH: ${monthLabel}

--- STATEMENT TEXT START ---
${slot.text.substring(0, 18000)}
--- STATEMENT TEXT END ---

Return ONLY a valid JSON object. No markdown, no code fences.

{
  "statementLabel": "${slot.label}",
  "person": "${slot.person}",
  "month": "${monthLabel}",
  "accountType": "bank/credit_card",
  "summary": {
    "totalSpend": 0,
    "totalCredits": 0,
    "closingBalance": 0,
    "creditCardDue": 0,
    "creditLimit": 0,
    "utilizationPct": 0,
    "transactionCount": 0
  },
  "categories": [
    {"name": "Shopping", "amount": 0, "count": 0},
    {"name": "Food & Dining", "amount": 0, "count": 0},
    {"name": "EMI Payments", "amount": 0, "count": 0},
    {"name": "Insurance", "amount": 0, "count": 0},
    {"name": "Travel", "amount": 0, "count": 0},
    {"name": "Entertainment", "amount": 0, "count": 0},
    {"name": "Investments/NPS", "amount": 0, "count": 0},
    {"name": "Utilities/Recharge", "amount": 0, "count": 0},
    {"name": "Transfers", "amount": 0, "count": 0},
    {"name": "Other", "amount": 0, "count": 0}
  ],
  "transactions": [
    {"date": "DD/MM/YYYY", "description": "...", "amount": 0, "type": "debit", "category": "Shopping"}
  ],
  "redFlags": [
    {"severity": "high", "title": "...", "description": "...", "amount": 0}
  ],
  "keyInsights": "2-3 sentence summary."
}

RULES: Extract ALL real transactions. "type" must be "debit" or "credit". All amounts numbers. JSON must be complete and valid.`;
}

function buildCompilePrompt(results, monthLabel) {
  let prompt = `You are a financial analyst. Compile a HOUSEHOLD financial report from the individual statement analyses below.

HOUSEHOLD: Harsh Kumar & Kirti Verma
MONTH: ${monthLabel}
STATEMENTS ANALYZED: ${results.length}

`;
  results.forEach((r, i) => {
    const d = r.data;
    prompt += `\n=== STATEMENT ${i + 1}: ${r.label} (${r.person === 'harsh' ? 'Harsh Kumar' : 'Kirti Verma'}) ===
Summary: Spend=${d.summary?.totalSpend || 0}, CCDue=${d.summary?.creditCardDue || 0}, Balance=${d.summary?.closingBalance || 0}
Key Insights: ${d.keyInsights || ''}
Categories: ${JSON.stringify((d.categories || []).filter((c) => c.amount > 0))}
Red Flags: ${JSON.stringify(d.redFlags || [])}
Top 20 Transactions: ${JSON.stringify((d.transactions || []).slice(0, 20))}
`;
  });
  prompt += `

Return ONLY valid JSON. No markdown.

{
  "summary": {
    "month": "${monthLabel}",
    "totalHouseholdSpend": 0,
    "harshTotalSpend": 0,
    "kirtiTotalSpend": 0,
    "totalCreditCardDues": 0,
    "cardDuesList": [{"card": "name", "person": "harsh", "due": 0}],
    "bankClosingBalance": 0,
    "topCategory": "",
    "topCategoryAmount": 0,
    "statementsAnalyzed": ${results.length}
  },
  "categories": [
    {"name": "Shopping", "amount": 0, "harshAmount": 0, "kirtiAmount": 0, "count": 0},
    {"name": "Food & Dining", "amount": 0, "harshAmount": 0, "kirtiAmount": 0, "count": 0},
    {"name": "EMI Payments", "amount": 0, "harshAmount": 0, "kirtiAmount": 0, "count": 0},
    {"name": "Insurance", "amount": 0, "harshAmount": 0, "kirtiAmount": 0, "count": 0},
    {"name": "Travel", "amount": 0, "harshAmount": 0, "kirtiAmount": 0, "count": 0},
    {"name": "Entertainment", "amount": 0, "harshAmount": 0, "kirtiAmount": 0, "count": 0},
    {"name": "Investments/NPS", "amount": 0, "harshAmount": 0, "kirtiAmount": 0, "count": 0},
    {"name": "Utilities/Recharge", "amount": 0, "harshAmount": 0, "kirtiAmount": 0, "count": 0},
    {"name": "Transfers", "amount": 0, "harshAmount": 0, "kirtiAmount": 0, "count": 0},
    {"name": "Other", "amount": 0, "harshAmount": 0, "kirtiAmount": 0, "count": 0}
  ],
  "transactions": [],
  "spendBySource": [{"source": "statement name", "person": "harsh", "amount": 0}],
  "redFlags": [{"severity": "high", "title": "...", "description": "...", "amount": 0}],
  "suggestions": [{"priority": 1, "text": "..."}],
  "aiNarrative": "4-5 paragraph household analysis with actual amounts."
}

Merge categories, combine transactions, deduplicate flags. transactions array = ALL from all statements.`;
  return prompt;
}

async function callClaude(prompt, maxTokens = 6000) {
  const res = await api.post('/chat', {
    model: 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });
  const content = res.data.content || [];
  return content.map((c) => c.text || '').join('');
}

const CHART_COLORS = ['#2dd4bf', '#f0c040', '#f97316', '#a78bfa', '#34d399', '#60a5fa', '#fb7185', '#6b7280'];

export default function ExpenseAnalyser() {
  const [statementMonth, setStatementMonth] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  });
  const [slots, setSlots] = useState({});
  const [results, setResults] = useState([]);
  const [finalData, setFinalData] = useState(null);
  const [view, setView] = useState('upload'); // 'upload' | 'report'
  const [analyzing, setAnalyzing] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [queueProgress, setQueueProgress] = useState({ current: 0, total: 0, label: '' });
  const [queueStates, setQueueStates] = useState({}); // id -> 'pending' | 'analyzing' | 'done' | 'error'
  const [expandedCard, setExpandedCard] = useState(null);
  const slotIdRef = useRef(0);

  const addSlot = useCallback((person) => {
    const id = `slot_${++slotIdRef.current}`;
    setSlots((prev) => ({
      ...prev,
      [id]: { person, file: null, text: '', label: '', status: 'empty' },
    }));
  }, []);

  const removeSlot = useCallback((id) => {
    setSlots((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const handleFileChange = useCallback(async (id, file) => {
    if (!file) return;
    setSlots((prev) => ({ ...prev, [id]: { ...prev[id], status: 'reading' } }));
    try {
      const text = await extractPdfText(file);
      const label = file.name.replace(/\.pdf$/i, '');
      setSlots((prev) => ({
        ...prev,
        [id]: {
          ...prev[id],
          file,
          text,
          label: label.length > 40 ? label.slice(0, 40) + '…' : label,
          status: 'ready',
        },
      }));
    } catch (err) {
      setSlots((prev) => ({ ...prev, [id]: { ...prev[id], status: 'error', error: err.message } }));
    }
  }, []);

  const runAnalysis = useCallback(async () => {
    const entries = Object.entries(slots).filter(([, s]) => s.text && s.status === 'ready');
    if (!entries.length) {
      alert('Please upload at least one PDF statement.');
      return;
    }
    setResults([]);
    setFinalData(null);
    setAnalyzing(true);
    setQueueStates(Object.fromEntries(entries.map(([id]) => [id, 'pending'])));
    setQueueProgress({ current: 0, total: entries.length, label: '' });

    const newResults = [];
    for (let i = 0; i < entries.length; i++) {
      const [id, slot] = entries[i];
      setQueueProgress({ current: i + 1, total: entries.length, label: slot.label });
      setQueueStates((prev) => ({ ...prev, [id]: 'analyzing' }));
      try {
        const prompt = buildSingleFilePrompt(slot, statementMonth);
        const raw = await callClaude(prompt);
        const data = robustParseJSON(raw);
        newResults.push({ slotId: id, label: slot.label, person: slot.person, data });
        setQueueStates((prev) => ({ ...prev, [id]: 'done' }));
      } catch (err) {
        newResults.push({ slotId: id, label: slot.label, person: slot.person, data: null, error: err.message });
        setQueueStates((prev) => ({ ...prev, [id]: 'error' }));
      }
      setResults([...newResults]);
    }
    setAnalyzing(false);
    setQueueProgress({ current: entries.length, total: entries.length, label: 'Done' });
  }, [slots, statementMonth]);

  const compileReport = useCallback(async () => {
    const successResults = results.filter((r) => r.data);
    if (!successResults.length) {
      alert('No successful analyses to compile.');
      return;
    }
    setCompiling(true);
    try {
      const monthLabel = formatMonthLabel(statementMonth);
      const prompt = buildCompilePrompt(successResults, monthLabel);
      const raw = await callClaude(prompt, 10000);
      const data = robustParseJSON(raw);
      setFinalData(data);
      setView('report');
    } catch (err) {
      alert('Compilation error: ' + err.message);
    } finally {
      setCompiling(false);
    }
  }, [results, statementMonth]);

  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    addSlot('harsh');
    addSlot('harsh');
    addSlot('kirti');
    addSlot('kirti');
  }, [addSlot]);

  const slotEntries = Object.entries(slots);
  const filledCount = slotEntries.filter(([, s]) => s.status === 'ready').length;
  const successResults = results.filter((r) => r.data);

  if (view === 'report' && finalData) {
    return (
      <ExpenseReportView
        finalData={finalData}
        statementMonth={statementMonth}
        results={results}
        onBack={() => setView('upload')}
      />
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Expense Analyser</h1>
        <p className="text-muted text-sm mt-0.5">
          Upload bank or credit card PDF statements. AI analyses each file, then compile a household report.
        </p>
      </div>

      {/* Upload cards — same UI style as Portfolio/Investments */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card">
          <p className="stat-label mb-2 flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-teal-400" /> Harsh
          </p>
          <p className="text-muted text-xs mb-3">Bank statements and credit card bills</p>
          <div className="space-y-2">
            {slotEntries.filter(([, s]) => s.person === 'harsh').map(([id, slot]) => (
              <FileSlotRow
                key={id}
                id={id}
                slot={slot}
                onFileChange={(file) => handleFileChange(id, file)}
                onRemove={() => removeSlot(id)}
              />
            ))}
          </div>
          <button type="button" onClick={() => addSlot('harsh')} className="btn-ghost w-full mt-2 flex items-center justify-center gap-2 text-sm">
            <Plus size={14} /> Add statement
          </button>
        </div>
        <div className="card">
          <p className="stat-label mb-2 flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-400" /> Kirti
          </p>
          <p className="text-muted text-xs mb-3">Bank statements and credit card bills</p>
          <div className="space-y-2">
            {slotEntries.filter(([, s]) => s.person === 'kirti').map(([id, slot]) => (
              <FileSlotRow
                key={id}
                id={id}
                slot={slot}
                onFileChange={(file) => handleFileChange(id, file)}
                onRemove={() => removeSlot(id)}
              />
            ))}
          </div>
          <button type="button" onClick={() => addSlot('kirti')} className="btn-ghost w-full mt-2 flex items-center justify-center gap-2 text-sm">
            <Plus size={14} /> Add statement
          </button>
        </div>
      </div>

      <div className="card max-w-md">
        <label className="label">Statement month</label>
        <input
          type="month"
          value={statementMonth}
          onChange={(e) => setStatementMonth(e.target.value)}
          className="input"
        />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={runAnalysis}
          disabled={analyzing || filledCount === 0}
          className="btn-primary flex items-center gap-2"
        >
          {analyzing ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
          {analyzing ? 'Analyzing…' : 'Analyze all statements'}
        </button>
        <span className="text-muted text-sm">{filledCount} file{filledCount !== 1 ? 's' : ''} ready</span>
      </div>

      {/* Queue */}
      {analyzing && (
        <div className="card">
          <p className="stat-label mb-3">Analysis queue</p>
          <div className="space-y-2">
            {Object.entries(queueStates).map(([id, state]) => {
              const slot = slots[id];
              if (!slot) return null;
              return (
                <div
                  key={id}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-sm ${
                    state === 'analyzing'
                      ? 'border-accent bg-accent/10'
                      : state === 'done'
                        ? 'border-green-500/40 bg-green-500/10'
                        : state === 'error'
                          ? 'border-rose/40 bg-rose/10'
                          : 'border-border bg-surface'
                  }`}
                >
                  {state === 'analyzing' && <Loader2 size={14} className="animate-spin shrink-0" />}
                  <span className="font-mono text-soft flex-1 truncate">{slot.label || id}</span>
                  <span className="text-muted text-xs capitalize">{slot.person}</span>
                  <span className="text-xs">
                    {state === 'pending' && 'Waiting…'}
                    {state === 'analyzing' && 'Analyzing…'}
                    {state === 'done' && 'Done'}
                    {state === 'error' && 'Error'}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-muted text-xs mt-2">
            {queueProgress.current} of {queueProgress.total} {queueProgress.label ? `· ${queueProgress.label}` : ''}
          </p>
        </div>
      )}

      {/* Result cards */}
      {results.length > 0 && !analyzing && (
        <>
          <div className="card">
            <p className="stat-label mb-3">Statement results</p>
            <p className="text-muted text-xs mb-4">Click a card to expand details.</p>
            <div className="space-y-3">
              {results.map((r, idx) => (
                <ResultCard
                  key={r.slotId}
                  result={r}
                  index={idx}
                  expanded={expandedCard === idx}
                  onToggle={() => setExpandedCard((c) => (c === idx ? null : idx))}
                />
              ))}
            </div>
          </div>

          {successResults.length > 0 && (
            <div className="card flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-display font-medium text-white">All statements analysed</p>
                <p className="text-muted text-xs mt-0.5">{successResults.length} ready to compile</p>
              </div>
              <button
                type="button"
                onClick={compileReport}
                disabled={compiling}
                className="btn-primary flex items-center gap-2"
              >
                {compiling ? <Loader2 size={14} className="animate-spin" /> : null}
                {compiling ? 'Compiling…' : 'Compile final report'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FileSlotRow({ id, slot, onFileChange, onRemove }) {
  const inputRef = useRef(null);
  return (
    <div
      className={`flex items-center gap-2 p-3 rounded-lg border transition-colors ${
        slot.status === 'ready' ? 'border-green-500/40 bg-green-500/5' : 'border-border bg-surface'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFileChange(f);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex-1 min-w-0 text-left text-sm text-soft truncate"
      >
        {slot.status === 'reading' && 'Reading PDF…'}
        {slot.status === 'ready' && (slot.label || 'PDF ready')}
        {slot.status === 'error' && (slot.error || 'Error')}
        {slot.status === 'empty' && 'Click to upload PDF'}
      </button>
      {slot.status !== 'empty' && (
        <button type="button" onClick={onRemove} className="text-muted hover:text-rose shrink-0 p-1">
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

function ResultCard({ result, index, expanded, onToggle }) {
  const { label, person, data, error } = result;
  const s = data?.summary || {};
  const txns = (data?.transactions || []).slice(0, 15);
  const flags = data?.redFlags || [];
  const topCats = (data?.categories || []).filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 5);

  if (error) {
    return (
      <div className="rounded-xl border border-rose/40 bg-rose/5 p-4">
        <div className="flex items-center justify-between">
          <span className="font-mono text-sm text-soft truncate">{label}</span>
          <span className="text-xs text-rose">Error</span>
        </div>
        <p className="text-muted text-xs mt-2">{error}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-surface/50 transition-colors"
      >
        <span className="text-lg">{data?.accountType === 'credit_card' ? '💳' : '🏦'}</span>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-white truncate">{label}</p>
          <p className="text-muted text-xs mt-0.5">
            {person === 'harsh' ? 'Harsh' : 'Kirti'} · {data?.month || ''} · {(data?.transactions || []).length} txns
            {flags.filter((f) => f.severity === 'high').length ? ` · ${flags.filter((f) => f.severity === 'high').length} red flag(s)` : ''}
          </p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          {s.creditCardDue ? (
            <div className="text-right">
              <p className="text-xs text-muted">CC Due</p>
              <p className="font-mono text-sm text-rose">{fmt(s.creditCardDue)}</p>
            </div>
          ) : null}
          {s.closingBalance ? (
            <div className="text-right">
              <p className="text-xs text-muted">Balance</p>
              <p className="font-mono text-sm text-green-400">{fmt(s.closingBalance)}</p>
            </div>
          ) : null}
          <div className="text-right">
            <p className="text-xs text-muted">Spent</p>
            <p className="font-mono text-sm text-white">{fmt(s.totalSpend)}</p>
          </div>
        </div>
        {expanded ? <ChevronDown size={18} className="text-muted" /> : <ChevronRight size={18} className="text-muted" />}
      </button>
      {expanded && (
        <div className="border-t border-border p-4 space-y-4 bg-surface/30">
          {data?.keyInsights && (
            <p className="text-sm text-soft leading-relaxed rounded-lg p-3 bg-teal-500/10 border border-teal-500/30">{data.keyInsights}</p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {s.totalSpend ? (
              <div className="rounded-lg bg-card border border-border p-2">
                <p className="text-xs text-muted uppercase">Total spend</p>
                <p className="font-mono text-sm text-white">{fmt(s.totalSpend)}</p>
              </div>
            ) : null}
            {s.creditCardDue ? (
              <div className="rounded-lg bg-rose/10 border border-rose/30 p-2">
                <p className="text-xs text-muted uppercase">CC due</p>
                <p className="font-mono text-sm text-rose">{fmt(s.creditCardDue)}</p>
              </div>
            ) : null}
            {s.closingBalance ? (
              <div className="rounded-lg bg-green-500/10 border border-green-500/30 p-2">
                <p className="text-xs text-muted uppercase">Balance</p>
                <p className="font-mono text-sm text-green-400">{fmt(s.closingBalance)}</p>
              </div>
            ) : null}
            {s.utilizationPct ? (
              <div className="rounded-lg bg-card border border-border p-2">
                <p className="text-xs text-muted uppercase">Utilization</p>
                <p className="font-mono text-sm">{s.utilizationPct}%</p>
              </div>
            ) : null}
          </div>
          {topCats.length > 0 && (
            <div>
              <p className="text-xs text-muted uppercase mb-2">Top categories</p>
              <div className="space-y-1">
                {topCats.map((c, i) => (
                  <div key={c.name} className="flex justify-between text-sm">
                    <span className="text-soft">{c.name}</span>
                    <span className="font-mono">{fmt(c.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {flags.length > 0 && (
            <div>
              <p className="text-xs text-muted uppercase mb-2">Red flags</p>
              <div className="space-y-2">
                {flags.map((f, i) => (
                  <div key={i} className="rounded-lg border-l-4 border-rose/50 bg-rose/5 p-2 text-sm">
                    <p className="font-medium text-soft">{f.title}{f.amount ? ` — ${fmt(f.amount)}` : ''}</p>
                    <p className="text-muted text-xs mt-0.5">{f.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {txns.length > 0 && (
            <div>
              <p className="text-xs text-muted uppercase mb-2">Recent transactions</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted text-xs uppercase">
                      <th className="text-left py-2">Date</th>
                      <th className="text-left py-2">Description</th>
                      <th className="text-left py-2">Category</th>
                      <th className="text-right py-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txns.map((t, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-1.5 text-muted">{t.date}</td>
                        <td className="py-1.5 text-soft truncate max-w-[180px]">{t.description}</td>
                        <td className="py-1.5 text-muted text-xs">{t.category || 'Other'}</td>
                        <td className={`py-1.5 text-right font-mono ${t.type === 'credit' ? 'text-green-400' : 'text-rose'}`}>
                          {t.type === 'credit' ? '+' : '−'}{fmtFull(Math.abs(Number(t.amount)))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ExpenseReportView({ finalData, statementMonth, results, onBack }) {
  const [tab, setTab] = useState('overview');
  const s = finalData.summary || {};
  const categories = (finalData.categories || []).filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount);
  const transactions = finalData.transactions || [];
  const redFlags = finalData.redFlags || [];
  const suggestions = finalData.suggestions || [];
  const cardDues = s.cardDuesList || [];
  const spendBySource = finalData.spendBySource || [];

  const totalDues = s.totalCreditCardDues || cardDues.reduce((a, c) => a + (Number(c.due) || 0), 0);

  const catChartData = categories.slice(0, 10).map((c) => ({ name: c.name, value: c.amount, amount: c.amount }));
  const personPieData = [
    { name: 'Harsh', value: s.harshTotalSpend || 0 },
    { name: 'Kirti', value: s.kirtiTotalSpend || 0 },
  ].filter((d) => d.value > 0);

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'categories', label: 'Categories' },
    { id: 'transactions', label: 'Transactions' },
    { id: 'flags', label: 'Alerts' },
    { id: 'suggestions', label: 'Suggestions' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Household report</h1>
          <p className="text-muted text-sm mt-0.5">
            {formatMonthLabel(statementMonth)} · {s.statementsAnalyzed || results.length} statements · {transactions.length} transactions
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => window.print()} className="btn-ghost text-sm">
            Print / PDF
          </button>
          <button type="button" onClick={onBack} className="btn-ghost text-sm">
            ← Back to upload
          </button>
        </div>
      </div>

      {/* KPI ribbon — same style as Portfolio net invested */}
      <div className="rounded-xl bg-accent/10 border border-accent/20 px-6 py-4 flex flex-wrap items-center gap-6">
        <div className="flex items-baseline gap-2">
          <span className="stat-label text-muted">Total spend</span>
          <span className="font-mono text-xl font-bold text-accent">{fmt(s.totalHouseholdSpend)}</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="stat-label text-muted">CC dues</span>
          <span className="font-mono text-xl font-bold text-rose">{fmt(totalDues)}</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="stat-label text-muted">Bank balance</span>
          <span className="font-mono text-xl font-bold text-green-400">{fmt(s.bankClosingBalance)}</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="stat-label text-muted">Harsh</span>
          <span className="font-mono text-lg text-white">{fmt(s.harshTotalSpend)}</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="stat-label text-muted">Kirti</span>
          <span className="font-mono text-lg text-white">{fmt(s.kirtiTotalSpend)}</span>
        </div>
        {s.topCategory ? (
          <div className="flex items-baseline gap-2">
            <span className="stat-label text-muted">Top category</span>
            <span className="font-mono text-sm text-soft">{s.topCategory} {s.topCategoryAmount ? fmt(s.topCategoryAmount) : ''}</span>
          </div>
        ) : null}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id ? 'bg-accent text-ink' : 'text-muted hover:text-white hover:bg-card'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {catChartData.length > 0 && (
            <div className="card">
              <p className="stat-label mb-3">Spending by category</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={catChartData} layout="vertical" margin={{ left: 80, right: 20 }}>
                  <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 10 }} tickFormatter={(v) => `${Number(v) / 1000}K`} />
                  <YAxis type="category" dataKey="name" width={80} tick={{ fill: '#9ca3af', fontSize: 10 }} />
                  <Tooltip formatter={(v) => [fmtFull(v), 'Amount']} contentStyle={{ background: '#1e2330', border: '1px solid #2a3040', borderRadius: 8 }} />
                  <Bar dataKey="value" fill="var(--accent)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {personPieData.length > 0 && (
            <div className="card">
              <p className="stat-label mb-3">Harsh vs Kirti spend</p>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={personPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {personPieData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => [fmtFull(v), '']} contentStyle={{ background: '#1e2330', border: '1px solid #2a3040', borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          {finalData.aiNarrative && (
            <div className="card md:col-span-2">
              <p className="stat-label mb-2">AI narrative</p>
              <p className="text-sm text-soft whitespace-pre-wrap leading-relaxed">{finalData.aiNarrative}</p>
            </div>
          )}
        </div>
      )}

      {tab === 'categories' && (
        <div className="card">
          <p className="stat-label mb-3">Category breakdown</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted text-xs uppercase">
                  <th className="text-left py-3">Category</th>
                  <th className="text-right py-3">Total</th>
                  <th className="text-right py-3">Harsh</th>
                  <th className="text-right py-3">Kirti</th>
                  <th className="text-right py-3">Count</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.name} className="border-b border-border/50">
                    <td className="py-3 text-soft">{c.name}</td>
                    <td className="py-3 text-right font-mono">{fmt(c.amount)}</td>
                    <td className="py-3 text-right font-mono text-teal-400">{fmt(c.harshAmount || 0)}</td>
                    <td className="py-3 text-right font-mono text-amber-400">{fmt(c.kirtiAmount || 0)}</td>
                    <td className="py-3 text-right text-muted">{c.count || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'transactions' && (
        <div className="card">
          <p className="stat-label mb-3">All transactions ({transactions.length})</p>
          <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-muted text-xs uppercase">
                  <th className="text-left py-2">Date</th>
                  <th className="text-left py-2">Description</th>
                  <th className="text-left py-2">Person</th>
                  <th className="text-left py-2">Category</th>
                  <th className="text-right py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.slice(0, 500).map((t, i) => (
                  <tr key={i} className="border-b border-border/40">
                    <td className="py-2 text-muted">{t.date}</td>
                    <td className="py-2 text-soft truncate max-w-[200px]">{t.description}</td>
                    <td className="py-2 text-muted text-xs">{t.person === 'harsh' ? 'Harsh' : 'Kirti'}</td>
                    <td className="py-2 text-muted text-xs">{t.category || 'Other'}</td>
                    <td className={`py-2 text-right font-mono ${t.type === 'credit' ? 'text-green-400' : 'text-rose'}`}>
                      {t.type === 'credit' ? '+' : '−'}{fmtFull(Math.abs(Number(t.amount)))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {transactions.length > 500 && <p className="text-muted text-xs mt-2">Showing first 500 of {transactions.length}</p>}
        </div>
      )}

      {tab === 'flags' && (
        <div className="space-y-4">
          {redFlags.length === 0 ? (
            <div className="card text-center py-8 text-green-400">No significant red flags detected.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {redFlags.map((f, i) => (
                <div
                  key={i}
                  className={`card border-l-4 ${
                    f.severity === 'high' ? 'border-rose' : f.severity === 'medium' ? 'border-amber-500' : 'border-teal-500'
                  }`}
                >
                  <p className="font-medium text-white">{f.title}{f.amount ? ` — ${fmt(f.amount)}` : ''}</p>
                  <p className="text-muted text-sm mt-1">{f.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'suggestions' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {suggestions.map((s, i) => (
            <div key={i} className="card flex gap-3">
              <span className="w-8 h-8 rounded-full bg-accent/20 text-accent flex items-center justify-center text-sm font-bold shrink-0">
                {i + 1}
              </span>
              <p className="text-soft text-sm leading-relaxed">{s.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
