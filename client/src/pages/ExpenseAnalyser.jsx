import { useCallback, useEffect, useRef, useState } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../lib/api';
import { fmt, fmtFull } from '../lib/utils';
import { useAuth } from '../hooks/useAuth';
import { Plus, Trash2, ChevronDown, ChevronRight, FileText, Loader2, KeyRound } from 'lucide-react';

/** Cashflow-style buckets (same family as monthly cashflow expense columns). */
const CASHFLOW_BUCKETS = ['Income', 'Other Income', 'Major', 'Non-Recurring', 'Regular', 'EMI', 'Trips', 'Transfers'];

const PDF_TEXT_MAX = 22000;

function formatApiError(err) {
  const d = err?.response?.data;
  if (!d) return err?.message || 'Request failed';
  if (typeof d.error === 'string') return d.error;
  if (d.error && typeof d.error === 'object' && d.error.message) return String(d.error.message);
  if (d.type === 'error' && d.error && typeof d.error === 'object' && d.error.message) {
    return String(d.error.message);
  }
  if (typeof d.message === 'string') return d.message;
  try {
    return JSON.stringify(d);
  } catch {
    return err?.message || 'Request failed';
  }
}

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

async function extractPdfText(file, password) {
  const pdfjsLib = await loadPdfScript();
  const buf = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: buf,
    ...(password ? { password: String(password) } : {}),
  });
  let pdf;
  try {
    pdf = await loadingTask.promise;
  } catch (err) {
    const name = err?.name || '';
    const msg = String(err?.message || err);
    if (name === 'PasswordException' || /password/i.test(msg)) {
      throw new Error('PDF_PASSWORD_REQUIRED');
    }
    throw err;
  }
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => it.str).join(' ') + '\n';
  }
  return text;
}

/** First top-level `{ ... }` using brace depth (strings aware). */
function extractBalancedObject(s) {
  const start = s.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else {
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) return s.slice(start, i + 1);
      }
    }
  }
  return s.slice(start);
}

function tryParseJsonBlock(block) {
  const tries = [
    block,
    block.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim(),
    block.replace(/,(\s*[}\]])/g, '$1'),
    block.replace(/[\u0000-\u001F\u007F]/g, ' '),
  ];
  for (const t of tries) {
    try {
      const o = JSON.parse(t);
      if (o && typeof o === 'object') return o;
    } catch (_) {}
  }
  return null;
}

/** Close truncated JSON (unterminated strings, missing }]). */
function repairTruncatedJson(block) {
  let s = String(block).trim();
  for (let iter = 0; iter < 40; iter++) {
    try {
      const o = JSON.parse(s);
      if (o && typeof o === 'object') return o;
    } catch (_) {
      let ob = 0;
      let cb = 0;
      let osq = 0;
      let csq = 0;
      let instr = false;
      let esc = false;
      for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (instr) {
          if (esc) esc = false;
          else if (c === '\\') esc = true;
          else if (c === '"') instr = false;
        } else {
          if (c === '"') instr = true;
          else if (c === '{') ob++;
          else if (c === '}') cb++;
          else if (c === '[') osq++;
          else if (c === ']') csq++;
        }
      }
      if (instr) {
        s += '"';
        continue;
      }
      s = s.replace(/,\s*$/g, '');
      while (osq > csq) {
        s += ']';
        csq++;
      }
      while (ob > cb) {
        s += '}';
        cb++;
      }
      s = s.replace(/,(\s*[}\]])/g, '$1');
    }
  }
  throw new Error('Could not parse AI response.');
}

function robustParseJSON(raw) {
  const str = String(raw).trim();
  const direct = tryParseJsonBlock(str);
  if (direct) return direct;

  const balanced = extractBalancedObject(str);
  if (balanced) {
    const p = tryParseJsonBlock(balanced);
    if (p) return p;
    try {
      return repairTruncatedJson(balanced);
    } catch (_) {}
  }

  const start = str.indexOf('{');
  const end = str.lastIndexOf('}');
  if (start !== -1 && end > start) {
    const slice = str.slice(start, end + 1);
    const p = tryParseJsonBlock(slice);
    if (p) return p;
    try {
      return repairTruncatedJson(slice);
    } catch (_) {}
  }
  throw new Error('Could not parse AI response.');
}

function buildSingleFilePrompt(slot) {
  const personName = String(slot.person || '').trim() || 'Account holder';
  const bucketList = CASHFLOW_BUCKETS.join(', ');
  return `You are a professional financial analyst. Analyze this single bank or credit card statement for ${personName}.

STATEMENT: ${slot.label}
PERSON (exact string for JSON): ${personName}

--- STATEMENT TEXT START ---
${slot.text.substring(0, PDF_TEXT_MAX)}
--- STATEMENT TEXT END ---

Return ONLY a valid JSON object. No markdown, no code fences.

{
  "statementLabel": "${slot.label}",
  "person": "${personName.replace(/"/g, '\\"')}",
  "month": "Infer statement period from the text (e.g. Dec 2025 or 01/12/2025–31/12/2025)",
  "accountType": "bank or credit_card",
  "summary": {
    "totalSpend": 0,
    "totalCredits": 0,
    "closingBalance": 0,
    "creditCardDue": 0,
    "creditLimit": 0,
    "utilizationPct": 0,
    "transactionCount": 0
  },
  "categoryHierarchy": [
    {
      "parent": "Food & Dining",
      "amount": 0,
      "count": 0,
      "subcategories": [{"name": "Restaurants", "amount": 0, "count": 0}, {"name": "Groceries", "amount": 0, "count": 0}]
    }
  ],
  "categories": [
    {"name": "Restaurants", "parentCategory": "Food & Dining", "amount": 0, "count": 0},
    {"name": "Shopping", "parentCategory": "Shopping", "amount": 0, "count": 0}
  ],
  "cashflowSummary": [
    {"bucket": "Regular", "amount": 0, "count": 0},
    {"bucket": "Major", "amount": 0, "count": 0}
  ],
  "transactions": [
    {"date": "DD/MM/YYYY", "description": "...", "amount": 0, "type": "debit", "category": "Restaurants", "parentCategory": "Food & Dining", "subcategory": "Restaurants", "cashflowType": "Regular"}
  ],
  "redFlags": [
    {"severity": "high", "title": "...", "description": "...", "amount": 0}
  ],
  "keyInsights": "2-3 sentence summary."
}

RULES:
- Extract ALL real transactions. "type" must be "debit" or "credit". Amounts are positive numbers.
- For EACH transaction set "cashflowType" to ONE of: ${bucketList}.
  Map spending: groceries/subscriptions/utilities → Regular; large one-off → Major; rare discretionary → Non-Recurring; travel → Trips; loan/EMI → EMI; internal xfer → Transfers; salary/refund inflow → Income or Other Income as appropriate.
- "cashflowSummary": one row per bucket you used; sum debits (and credits for Income buckets as appropriate).
- "categoryHierarchy": parents are broad groups (Food & Dining, Travel, Bills…); "subcategories" sum to parent "amount". Keep "categories" as flat rows with parentCategory for charts (amounts must match hierarchy).
- If you run out of space: set "redFlags": [] and shorten "keyInsights", but you MUST output complete valid JSON with every bracket closed — never truncate mid-object.`;
}

function buildCompilePrompt(results, personNames) {
  const names = Array.isArray(personNames) && personNames.length ? personNames : ['Household'];
  const householdLine = names.join(', ');
  const perPersonZero = names.reduce((o, n) => ({ ...o, [n]: 0 }), {});
  const perPersonJson = JSON.stringify(perPersonZero);

  let prompt = `You are a financial analyst. Compile a HOUSEHOLD financial report from the individual statement analyses below.

HOUSEHOLD MEMBERS: ${householdLine}
STATEMENTS ANALYZED: ${results.length}
Use these EXACT person name strings in JSON: ${JSON.stringify(names)}
Infer overall reporting period from statement dates and set summary.month (e.g. "Dec 2025" or date range).

`;
  results.forEach((r, i) => {
    const d = r.data;
    const p = r.person || d.person || '';
    prompt += `\n=== STATEMENT ${i + 1}: ${r.label} (person: ${p}) ===
Summary: Spend=${d.summary?.totalSpend || 0}, CCDue=${d.summary?.creditCardDue || 0}, Balance=${d.summary?.closingBalance || 0}
Key Insights: ${d.keyInsights || ''}
Category hierarchy: ${JSON.stringify(d.categoryHierarchy || [])}
Categories (flat): ${JSON.stringify((d.categories || []).filter((c) => c.amount > 0))}
Cashflow summary: ${JSON.stringify(d.cashflowSummary || [])}
Red Flags: ${JSON.stringify(d.redFlags || [])}
Top 25 Transactions: ${JSON.stringify((d.transactions || []).slice(0, 25))}
`;
  });
  prompt += `

Return ONLY valid JSON. No markdown.

{
  "summary": {
    "month": "Period label from statements",
    "totalHouseholdSpend": 0,
    "totalSpendByPerson": ${perPersonJson},
    "harshTotalSpend": 0,
    "kirtiTotalSpend": 0,
    "totalCreditCardDues": 0,
    "cardDuesList": [{"card": "name", "person": "exact name from list", "due": 0}],
    "bankClosingBalance": 0,
    "topCategory": "",
    "topCategoryAmount": 0,
    "statementsAnalyzed": ${results.length}
  },
  "categoryHierarchy": [
    {
      "parent": "Food & Dining",
      "amount": 0,
      "count": 0,
      "perPersonAmounts": ${perPersonJson},
      "subcategories": [{"name": "Restaurants", "amount": 0, "count": 0, "perPersonAmounts": ${perPersonJson}}]
    }
  ],
  "categories": [
    {"name": "Shopping", "parentCategory": "Shopping", "amount": 0, "perPersonAmounts": ${perPersonJson}, "count": 0}
  ],
  "cashflowSummary": [
    {"bucket": "Regular", "amount": 0, "count": 0, "perPersonAmounts": ${perPersonJson}}
  ],
  "transactions": [],
  "spendBySource": [{"source": "statement name", "person": "exact name", "amount": 0}],
  "redFlags": [{"severity": "high", "title": "...", "description": "...", "amount": 0}],
  "suggestions": [{"priority": 1, "text": "..."}],
  "aiNarrative": "4-5 paragraph household analysis with actual amounts."
}

RULES:
- Fill totalSpendByPerson with spend per member (debits). You may leave harshTotalSpend/kirtiTotalSpend as 0 if you use totalSpendByPerson.
- "categoryHierarchy": merge parents across statements; subcategory amounts sum to parent; each parent and subcategory MUST include perPersonAmounts for every name in ${JSON.stringify(names)}.
- Flat "categories" should stay consistent with hierarchy (for charts); each row needs perPersonAmounts.
- cashflowSummary: merge buckets ${CASHFLOW_BUCKETS.join(', ')} across all statements; include perPersonAmounts per bucket.
- transactions: include ALL transactions from all statements; each must have "person" matching one of ${JSON.stringify(names)}, plus "category", optional parentCategory/subcategory, and "cashflowType".
- Merge duplicate categories where sensible. Deduplicate red flags.`;
  return prompt;
}

async function callClaude(prompt, maxTokens = 6000) {
  try {
    const res = await api.post('/chat', {
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });
    const content = res.data.content || [];
    return content.map((c) => c.text || '').join('');
  } catch (e) {
    throw new Error(formatApiError(e));
  }
}

const CHART_COLORS = ['#2dd4bf', '#f0c040', '#f97316', '#a78bfa', '#34d399', '#60a5fa', '#fb7185', '#6b7280'];

export default function ExpenseAnalyser() {
  const { persons, token, fetchPersons } = useAuth();
  const [slotsPer, setSlotsPer] = useState(3);
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
  const slotsBootstrapped = useRef(false);
  const [expenseSettingsReady, setExpenseSettingsReady] = useState(false);

  const loadExpenseSettings = useCallback(() => {
    api
      .get('/settings')
      .then((r) => {
        setSlotsPer(r.data.expenseAnalyserSlotsPerProfile || 3);
        setExpenseSettingsReady(true);
      })
      .catch(() => setExpenseSettingsReady(true));
  }, []);

  useEffect(() => {
    loadExpenseSettings();
  }, [loadExpenseSettings]);

  useEffect(() => {
    const on = () => loadExpenseSettings();
    window.addEventListener('investtrack-settings', on);
    return () => window.removeEventListener('investtrack-settings', on);
  }, [loadExpenseSettings]);

  useEffect(() => {
    if (!token) return;
    api
      .get('/expense-analyser/snapshot')
      .then(({ data }) => {
        if (Array.isArray(data.results) && data.results.length) setResults(data.results);
        if (data.finalData && typeof data.finalData === 'object') {
          setFinalData(data.finalData);
          setView('report');
        }
      })
      .catch((e) => {
        console.warn('expense snapshot load failed', e);
      });
  }, [token]);

  useEffect(() => {
    if (!persons.length || !expenseSettingsReady || slotsBootstrapped.current) return;
    const initial = Math.min(2, Math.max(1, slotsPer));
    const next = {};
    persons.forEach((p) => {
      for (let i = 0; i < initial; i++) {
        next[`slot_${++slotIdRef.current}`] = {
          person: p,
          file: null,
          text: '',
          label: '',
          status: 'empty',
          pdfPassword: '',
        };
      }
    });
    setSlots(next);
    slotsBootstrapped.current = true;
  }, [persons, slotsPer, expenseSettingsReady]);

  const setSlotPdfPassword = useCallback((id, pdfPassword) => {
    setSlots((prev) => ({
      ...prev,
      [id]: { ...prev[id], pdfPassword },
    }));
  }, []);

  const addSlot = useCallback(
    (person) => {
      setSlots((prev) => {
        const n = Object.values(prev).filter((s) => s.person === person).length;
        if (n >= slotsPer) return prev;
        const sid = `slot_${++slotIdRef.current}`;
        return {
          ...prev,
          [sid]: { person, file: null, text: '', label: '', status: 'empty', pdfPassword: '' },
        };
      });
    },
    [slotsPer]
  );

  const removeSlot = useCallback((id) => {
    setSlots((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const readPdfIntoSlot = useCallback((id, file) => {
    if (!file) return;
    setSlots((prev) => {
      const slot = prev[id];
      if (!slot) return prev;
      const pwd = slot.pdfPassword || '';
      (async () => {
        try {
          const text = await extractPdfText(file, pwd);
          const label = file.name.replace(/\.pdf$/i, '');
          setSlots((p) => ({
            ...p,
            [id]: {
              ...p[id],
              file,
              text,
              label: label.length > 40 ? label.slice(0, 40) + '…' : label,
              status: 'ready',
              error: null,
            },
          }));
        } catch (err) {
          const msg =
            err.message === 'PDF_PASSWORD_REQUIRED'
              ? 'This PDF is password-protected. Enter the password below, then choose the file again (or use Retry).'
              : err.message;
          setSlots((p) => ({
            ...p,
            [id]: { ...p[id], file, status: 'error', error: msg },
          }));
        }
      })();
      return { ...prev, [id]: { ...slot, file, status: 'reading', error: null } };
    });
  }, []);

  const handleFileChange = useCallback(
    (id, file) => {
      readPdfIntoSlot(id, file);
    },
    [readPdfIntoSlot]
  );

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
        const prompt = buildSingleFilePrompt(slot);
        const raw = await callClaude(prompt, 12000);
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
    try {
      await api.put('/expense-analyser/snapshot', { results: newResults });
    } catch (e) {
      alert('Analysis finished but could not save to your account: ' + formatApiError(e));
    }
  }, [slots]);

  const compileReport = useCallback(async () => {
    const successResults = results.filter((r) => r.data);
    if (!successResults.length) {
      alert('No successful analyses to compile.');
      return;
    }
    setCompiling(true);
    try {
      const prompt = buildCompilePrompt(successResults, persons);
      const raw = await callClaude(prompt, 12000);
      const data = robustParseJSON(raw);
      setFinalData(data);
      setView('report');
      try {
        await api.put('/expense-analyser/snapshot', {
          statementMonth: '',
          finalData: data,
          results,
        });
      } catch (e) {
        alert('Report was built but could not be saved: ' + formatApiError(e));
        console.error('Failed to save expense report snapshot', e);
      }
    } catch (err) {
      alert('Compilation error: ' + (err?.message || String(err)));
    } finally {
      setCompiling(false);
    }
  }, [results, persons]);

  const slotEntries = Object.entries(slots);
  const filledCount = slotEntries.filter(([, s]) => s.status === 'ready').length;
  const successResults = results.filter((r) => r.data);

  if (view === 'report' && finalData) {
    return (
      <ExpenseReportView
        finalData={finalData}
        results={results}
        personNames={persons}
        onBack={() => setView('upload')}
      />
    );
  }

  if (!persons.length) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <h1 className="font-display text-2xl font-bold text-white">Expense Analyser</h1>
        <div className="card max-w-lg">
          <p className="text-soft text-sm mb-4">Add people under Settings → People first. Upload slots per profile are set there too.</p>
          <button type="button" className="btn-primary text-sm" onClick={() => fetchPersons?.()}>
            Refresh profiles
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Expense Analyser</h1>
        <p className="text-muted text-sm mt-0.5">
          Upload bank or credit card PDFs (password-supported). AI categorises spend into cashflow-style buckets, then compile a household summary.
          Saved report persists after refresh — change upload slots per profile in Settings.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {persons.map((person, pi) => (
          <div key={person} className="card">
            <p className="stat-label mb-2 flex items-center gap-2">
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ background: CHART_COLORS[pi % CHART_COLORS.length] }}
              />
              {person}
            </p>
            <p className="text-muted text-xs mb-3">
              Up to {slotsPer} statements · encrypted PDF: enter password, then upload or Retry
            </p>
            <div className="space-y-2">
              {slotEntries
                .filter(([, s]) => s.person === person)
                .map(([id, slot]) => (
                  <FileSlotRow
                    key={id}
                    slot={slot}
                    onFileChange={(file) => handleFileChange(id, file)}
                    onPdfPasswordChange={(v) => setSlotPdfPassword(id, v)}
                    onRetry={() => slot.file && readPdfIntoSlot(id, slot.file)}
                    onRemove={() => removeSlot(id)}
                  />
                ))}
            </div>
            <button
              type="button"
              onClick={() => addSlot(person)}
              disabled={slotEntries.filter(([, s]) => s.person === person).length >= slotsPer}
              className="btn-ghost w-full mt-2 flex items-center justify-center gap-2 text-sm disabled:opacity-40"
            >
              <Plus size={14} /> Add statement
            </button>
          </div>
        ))}
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

function FileSlotRow({ slot, onFileChange, onPdfPasswordChange, onRetry, onRemove }) {
  const inputRef = useRef(null);
  return (
    <div
      className={`flex flex-col gap-2 p-3 rounded-lg border transition-colors ${
        slot.status === 'ready' ? 'border-green-500/40 bg-green-500/5' : 'border-border bg-surface'
      }`}
    >
      <div className="flex items-center gap-2">
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
      <div className="flex items-center gap-2">
        <KeyRound size={12} className="text-muted shrink-0" />
        <input
          type="password"
          className="input flex-1 text-xs py-1.5"
          placeholder="PDF password (if protected)"
          value={slot.pdfPassword || ''}
          onChange={(e) => onPdfPasswordChange?.(e.target.value)}
          autoComplete="off"
        />
        {slot.status === 'error' && slot.file && (
          <button type="button" onClick={onRetry} className="btn-ghost text-xs py-1 px-2 shrink-0">
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

function subKeyForTxn(t) {
  const p = t.parentCategory || t.parent;
  const s = t.subcategory || t.sub;
  const cat = t.category ? String(t.category) : '';
  if (p && s && String(p) !== String(s)) return { parent: String(p), sub: String(s) };
  if (cat) return { parent: String(p || cat || 'Other'), sub: String(s || cat || 'General') };
  return { parent: 'Other', sub: 'General' };
}

/** Parent → subcategory → transactions (debit totals for sorting). */
function groupTransactionsIntoCategoryTree(transactions) {
  const list = Array.isArray(transactions) ? transactions : [];
  const parents = new Map();
  for (const t of list) {
    const { parent, sub } = subKeyForTxn(t);
    if (!parents.has(parent)) parents.set(parent, { parent, subs: new Map() });
    const subs = parents.get(parent).subs;
    if (!subs.has(sub)) subs.set(sub, []);
    subs.get(sub).push(t);
  }
  const out = [];
  for (const [, g] of parents) {
    const subs = [];
    let pDebit = 0;
    for (const [name, txs] of g.subs) {
      let subDebit = 0;
      for (const x of txs) {
        if (x.type !== 'credit') subDebit += Number(x.amount) || 0;
      }
      pDebit += subDebit;
      subs.push({ name, transactions: txs, amount: subDebit });
    }
    subs.sort((a, b) => b.amount - a.amount);
    out.push({ parent: g.parent, subs, amount: pDebit });
  }
  out.sort((a, b) => b.amount - a.amount);
  return out;
}

function CategoryTransactionTree({ transactions, showPerson = false }) {
  const tree = groupTransactionsIntoCategoryTree(transactions);
  const [openParents, setOpenParents] = useState(() => new Set());
  const [openSubs, setOpenSubs] = useState(() => new Set());

  const toggleP = (k) => {
    setOpenParents((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  };
  const toggleS = (k) => {
    setOpenSubs((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  };

  if (!tree.length) {
    return <p className="text-muted text-sm">No transactions in this data.</p>;
  }

  return (
    <div className="space-y-2 max-h-[min(70vh,720px)] overflow-y-auto pr-1">
      {tree.map((g) => {
        const pk = g.parent;
        const pOpen = openParents.has(pk);
        return (
          <div key={pk} className="rounded-lg border border-border/60 bg-card/40 overflow-hidden">
            <button
              type="button"
              onClick={() => toggleP(pk)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface/50"
            >
              {pOpen ? <ChevronDown size={16} className="text-muted shrink-0" /> : <ChevronRight size={16} className="text-muted shrink-0" />}
              <span className="flex-1 min-w-0 font-medium text-soft truncate">{g.parent}</span>
              <span className="font-mono text-sm text-muted">{fmt(g.amount)}</span>
            </button>
            {pOpen && (
              <div className="border-t border-border/40 bg-surface/20 px-2 py-2 space-y-1">
                {g.subs.map((sub) => {
                  const sk = `${pk}::${sub.name}`;
                  const sOpen = openSubs.has(sk);
                  return (
                    <div key={sk} className="rounded-md border border-border/50 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => toggleS(sk)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-surface/40 text-sm"
                      >
                        {sOpen ? <ChevronDown size={14} className="text-muted shrink-0" /> : <ChevronRight size={14} className="text-muted shrink-0" />}
                        <span className="flex-1 min-w-0 text-muted truncate pl-1">{sub.name}</span>
                        <span className="font-mono text-xs">{fmt(sub.amount)}</span>
                        <span className="text-muted text-xs w-12 text-right">{sub.transactions.length}</span>
                      </button>
                      {sOpen && (
                        <div className="border-t border-border/30 px-2 py-1 bg-card/30 overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-muted uppercase border-b border-border/40">
                                <th className="text-left py-1 pr-2">Date</th>
                                <th className="text-left py-1">Description</th>
                                {showPerson ? <th className="text-left py-1">Person</th> : null}
                                <th className="text-left py-1">Bucket</th>
                                <th className="text-right py-1">Amt</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sub.transactions.map((t, i) => (
                                <tr key={i} className="border-b border-border/20">
                                  <td className="py-1 text-muted whitespace-nowrap">{t.date}</td>
                                  <td className="py-1 text-soft max-w-[200px] truncate">{t.description}</td>
                                  {showPerson ? (
                                    <td className="py-1 text-muted">{typeof t.person === 'string' && t.person ? t.person : '—'}</td>
                                  ) : null}
                                  <td className="py-1 text-muted">{t.cashflowType || '—'}</td>
                                  <td className={`py-1 text-right font-mono whitespace-nowrap ${t.type === 'credit' ? 'text-green-400' : 'text-rose'}`}>
                                    {t.type === 'credit' ? '+' : '−'}
                                    {fmtFull(Math.abs(Number(t.amount)))}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ResultCard({ result, index, expanded, onToggle }) {
  const { label, person, data, error } = result;
  const s = data?.summary || {};
  const allTx = data?.transactions || [];
  const flags = data?.redFlags || [];

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
            {person || data?.person || '—'} · {data?.month || ''} · {(data?.transactions || []).length} txns
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
          {allTx.length > 0 && (
            <div>
              <p className="text-xs text-muted uppercase mb-2">By category → subcategory → transactions</p>
              <CategoryTransactionTree transactions={allTx} showPerson={false} />
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
        </div>
      )}
    </div>
  );
}

function mergePerPerson(target, src) {
  if (!src || typeof src !== 'object') return;
  for (const [k, v] of Object.entries(src)) {
    target[k] = (Number(target[k]) || 0) + (Number(v) || 0);
  }
}

function normalizeCategoryHierarchy(finalData) {
  const ch = finalData?.categoryHierarchy;
  if (Array.isArray(ch) && ch.length) {
    return ch
      .map((h) => ({
        parent: String(h.parent || h.name || 'Other'),
        amount: Number(h.amount) || 0,
        count: h.count,
        perPersonAmounts: h.perPersonAmounts && typeof h.perPersonAmounts === 'object' ? { ...h.perPersonAmounts } : {},
        subs: (Array.isArray(h.subcategories) ? h.subcategories : Array.isArray(h.subs) ? h.subs : []).map((s) => ({
          name: String(s.name || s.subcategory || '—'),
          amount: Number(s.amount) || 0,
          count: s.count,
          perPersonAmounts: s.perPersonAmounts && typeof s.perPersonAmounts === 'object' ? { ...s.perPersonAmounts } : {},
        })),
      }))
      .filter((g) => g.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  }
  const flat = (finalData?.categories || []).filter((c) => Number(c.amount) > 0);
  const map = new Map();
  for (const c of flat) {
    const amt = Number(c.amount) || 0;
    const parent = c.parentCategory || c.parent;
    const sub = c.subcategory || c.sub;
    if (parent && sub) {
      if (!map.has(parent)) {
        map.set(parent, { parent, amount: 0, count: 0, subs: [], perPersonAmounts: {} });
      }
      const g = map.get(parent);
      g.amount += amt;
      g.count = (g.count || 0) + (Number(c.count) || 0);
      g.subs.push({
        name: sub,
        amount: amt,
        count: c.count,
        perPersonAmounts: c.perPersonAmounts && typeof c.perPersonAmounts === 'object' ? { ...c.perPersonAmounts } : {},
      });
      mergePerPerson(g.perPersonAmounts, c.perPersonAmounts);
    } else {
      const pname = String(c.name || 'Other');
      if (!map.has(pname)) {
        map.set(pname, { parent: pname, amount: 0, count: 0, subs: [], perPersonAmounts: {} });
      }
      const g = map.get(pname);
      g.amount += amt;
      g.count = (g.count || 0) + (Number(c.count) || 0);
      mergePerPerson(g.perPersonAmounts, c.perPersonAmounts);
    }
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

function personAmount(c, personName) {
  const pp = c.perPersonAmounts;
  if (pp && typeof pp === 'object' && personName in pp) return Number(pp[personName]) || 0;
  if (personName === 'Harsh' || personName === 'harsh') return Number(c.harshAmount) || 0;
  if (personName === 'Kirti' || personName === 'kirti') return Number(c.kirtiAmount) || 0;
  return 0;
}

function spendSlicesFromSummary(s, personNames) {
  const by = s.totalSpendByPerson;
  if (by && typeof by === 'object' && !Array.isArray(by)) {
    return Object.entries(by)
      .map(([name, value]) => ({ name, value: Number(value) || 0 }))
      .filter((d) => d.value > 0);
  }
  const legacy = [];
  if (Number(s.harshTotalSpend) > 0) legacy.push({ name: 'Harsh', value: Number(s.harshTotalSpend) });
  if (Number(s.kirtiTotalSpend) > 0) legacy.push({ name: 'Kirti', value: Number(s.kirtiTotalSpend) });
  if (legacy.length) return legacy;
  return (personNames || []).map((name) => ({ name, value: 0 })).filter((d) => d.value > 0);
}

function ExpenseReportView({ finalData, results, personNames = [], onBack }) {
  const [tab, setTab] = useState('overview');
  const s = finalData.summary || {};
  const categories = (finalData.categories || []).filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount);
  const hierarchyGroups = normalizeCategoryHierarchy(finalData);
  const cashflowSummary = (finalData.cashflowSummary || []).filter((c) => Number(c.amount) > 0).sort((a, b) => b.amount - a.amount);
  const transactions = finalData.transactions || [];
  const redFlags = finalData.redFlags || [];
  const suggestions = finalData.suggestions || [];
  const cardDues = s.cardDuesList || [];
  const spendBySource = finalData.spendBySource || [];

  const totalDues = s.totalCreditCardDues || cardDues.reduce((a, c) => a + (Number(c.due) || 0), 0);

  const catChartData = (
    hierarchyGroups.length
      ? hierarchyGroups
      : categories.map((c) => ({ parent: c.name, amount: c.amount }))
  )
    .slice(0, 10)
    .map((c) => ({ name: c.parent || c.name, value: c.amount, amount: c.amount }));
  const cfChartData = cashflowSummary.slice(0, 12).map((c) => ({
    name: c.bucket,
    value: c.amount,
    amount: c.amount,
  }));
  const personPieData = spendSlicesFromSummary(s, personNames);

  const nameCols =
    personNames.length > 0
      ? personNames
      : personPieData.length
        ? [...new Set(personPieData.map((p) => p.name))]
        : ['Harsh', 'Kirti'];

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'cashflow', label: 'Cashflow buckets' },
    { id: 'categories', label: 'Categories & transactions' },
    { id: 'flags', label: 'Alerts' },
    { id: 'suggestions', label: 'Suggestions' },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Household report</h1>
          <p className="text-muted text-sm mt-0.5">
            {s.month ? `${s.month} · ` : ''}
            {s.statementsAnalyzed || results.length} statements · {transactions.length} transactions
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
        {(s.totalSpendByPerson &&
        typeof s.totalSpendByPerson === 'object' &&
        Object.keys(s.totalSpendByPerson).length > 0
          ? Object.entries(s.totalSpendByPerson)
          : [
              ['Harsh', s.harshTotalSpend],
              ['Kirti', s.kirtiTotalSpend],
            ].filter(([, v]) => Number(v) > 0)
        ).map(([name, amt]) => (
          <div key={name} className="flex items-baseline gap-2">
            <span className="stat-label text-muted">{name}</span>
            <span className="font-mono text-lg text-white">{fmt(Number(amt) || 0)}</span>
          </div>
        ))}
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
                  <Tooltip formatter={(v, name) => [fmtFull(v), name || 'Amount']} contentStyle={{ background: '#0f1117', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, fontSize: 12, color: '#e2e8f0', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }} labelStyle={{ color: '#8b95a5', fontWeight: 600 }} />
                  <Bar dataKey="value" fill="var(--accent)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {personPieData.length > 0 && (
            <div className="card">
              <p className="stat-label mb-3">Spend by profile</p>
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
                  <Tooltip formatter={(v, name) => [fmtFull(v), name]} contentStyle={{ background: '#0f1117', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, fontSize: 12, color: '#e2e8f0', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }} labelStyle={{ color: '#8b95a5', fontWeight: 600 }} />
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

      {tab === 'cashflow' && (
        <div className="space-y-4">
          {cfChartData.length > 0 ? (
            <div className="card">
              <p className="stat-label mb-3">Spending by cashflow bucket (Major, Regular, EMI, …)</p>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={cfChartData} layout="vertical" margin={{ left: 100, right: 20 }}>
                  <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 10 }} tickFormatter={(v) => `${Number(v) / 1000}K`} />
                  <YAxis type="category" dataKey="name" width={96} tick={{ fill: '#9ca3af', fontSize: 10 }} />
                  <Tooltip
                    formatter={(v) => [fmtFull(v), 'Amount']}
                    contentStyle={{
                      background: '#0f1117',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 12,
                      fontSize: 12,
                      color: '#e2e8f0',
                    }}
                  />
                  <Bar dataKey="value" fill="#60a5fa" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="card text-muted text-sm">No cashflow bucket data in this report. Re-compile after uploading statements.</div>
          )}
          {cashflowSummary.length > 0 && (
            <div className="card overflow-x-auto">
              <p className="stat-label mb-3">Bucket detail</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted text-xs uppercase">
                    <th className="text-left py-2">Bucket</th>
                    <th className="text-right py-2">Amount</th>
                    <th className="text-right py-2">Count</th>
                    {nameCols.map((n) => (
                      <th key={n} className="text-right py-2">
                        {n}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cashflowSummary.map((c) => (
                    <tr key={c.bucket} className="border-b border-border/50">
                      <td className="py-2 text-soft">{c.bucket}</td>
                      <td className="py-2 text-right font-mono">{fmt(c.amount)}</td>
                      <td className="py-2 text-right text-muted">{c.count ?? '—'}</td>
                      {nameCols.map((n) => (
                        <td key={n} className="py-2 text-right font-mono text-xs">
                          {fmt(personAmount(c, n))}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'categories' && (
        <div className="card">
          <p className="stat-label mb-3">Category → subcategory → transactions</p>
          <p className="text-muted text-xs mb-4">
            Expand a category, then a subcategory, to see each line item. Totals shown are debit subtotals for sorting.
          </p>
          <CategoryTransactionTree transactions={transactions} showPerson />
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
