import { useState } from 'react';
import api from '../lib/api';
import { MessageSquare, Loader2 } from 'lucide-react';

const TRADE_INSTRUMENTS = [
  { id: 'nifty50', name: 'Nifty 50', ticker: 'NSE Nifty 50' },
  { id: 'niftybank', name: 'Nifty Bank', ticker: 'NSE Nifty Bank' },
  { id: 'niftyit', name: 'Nifty IT', ticker: 'NSE Nifty IT' },
  { id: 'niftypharma', name: 'Nifty Pharma', ticker: 'NSE Nifty Pharma' },
  { id: 'niftyauto', name: 'Nifty Auto', ticker: 'NSE Nifty Auto' },
  { id: 'niftymetal', name: 'Nifty Metal', ticker: 'NSE Nifty Metal' },
  { id: 'niftyfmcg', name: 'Nifty FMCG', ticker: 'NSE Nifty FMCG' },
  { id: 'niftyenergy', name: 'Nifty Energy', ticker: 'NSE Nifty Energy' },
  { id: 'gold', name: 'Gold', ticker: 'Gold (MCX / Spot)' },
  { id: 'silver', name: 'Silver', ticker: 'Silver (MCX / Spot)' },
  { id: 'nasdaq', name: 'NASDAQ-100', ticker: 'QQQ / NDX' },
  { id: 'sp500', name: 'S&P 500', ticker: 'SPY / SPX' },
  { id: 'russell1000', name: 'Russell 1000', ticker: 'IWB / RUI' },
];

function buildTradeFeedbackPrompt(portfolioContext, instrument, amount) {
  const ctx = (portfolioContext || '').trim();
  return `You are a portfolio advisor. The user is asking for feedback on a potential trade.

PORTFOLIO / GOAL CONTEXT (user-provided):
${ctx || '(None provided — give general guidance)'}

PROPOSED TRADE:
- Instrument: ${instrument.name} (${instrument.ticker})
- Amount: ₹${Number(amount || 0).toLocaleString('en-IN')}

Provide a concise, actionable response (3–6 short paragraphs or bullets):
1. Does this trade make sense given their portfolio/goal? Why or why not?
2. If they have existing positions, how does this add/change allocation?
3. If they have a goal (e.g. balanced, growth), does this align?
4. Specific recommendation: GO AHEAD / MODIFY (suggest changes) / AVOID / DEFER (wait for better level).
5. Any caveats or levels to watch.

Be direct and practical. Use ₹ and % where relevant. Return plain text, no JSON.`;
}

export default function TradeFeedbackCard({ defaultPortfolioContext = '' }) {
  const [portfolioContext, setPortfolioContext] = useState(defaultPortfolioContext);
  const [instrumentId, setInstrumentId] = useState(TRADE_INSTRUMENTS[0]?.id || '');
  const [amount, setAmount] = useState('25000');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [error, setError] = useState(null);

  const instrument = TRADE_INSTRUMENTS.find((i) => i.id === instrumentId) || TRADE_INSTRUMENTS[0];

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amt = parseInt(amount, 10);
    if (!instrument || isNaN(amt) || amt <= 0) return;
    setLoading(true);
    setError(null);
    setFeedback(null);
    try {
      const prompt = buildTradeFeedbackPrompt(portfolioContext, instrument, amt);
      const res = await api.post('/chat', {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      });
      const content = res.data.content || [];
      const text = content.map((c) => c.text || '').join('');
      setFeedback(text);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare size={18} className="text-accent" />
        <h2 className="font-display font-semibold text-white text-lg">Portfolio &amp; trade feedback</h2>
      </div>
      <p className="text-muted text-sm mb-4">
        Enter your portfolio or goal, then ask if investing a specific amount in an instrument makes sense. Get a recommendation based on your existing position and goal type.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Portfolio / goal</label>
          <textarea
            className="input min-h-[80px] resize-y"
            placeholder="e.g. Current: 50% Nifty, 30% Gold, 20% US. Goal: Balanced 50-30-20 India-US-Metal"
            value={portfolioContext}
            onChange={(e) => setPortfolioContext(e.target.value)}
            rows={3}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Instrument</label>
            <select
              className="input"
              value={instrumentId}
              onChange={(e) => setInstrumentId(e.target.value)}
            >
              {TRADE_INSTRUMENTS.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Amount (₹)</label>
            <input
              type="number"
              className="input"
              placeholder="25000"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="btn-primary flex items-center gap-2"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <MessageSquare size={16} />}
          {loading ? 'Getting feedback…' : 'Get feedback'}
        </button>
      </form>

      {error && (
        <div className="mt-4 p-3 rounded-lg bg-rose/10 border border-rose/30 text-rose text-sm">
          {error}
        </div>
      )}

      {feedback && !loading && (
        <div className="mt-4 p-4 rounded-xl bg-accent/5 border border-accent/20">
          <p className="text-xs text-accent font-semibold uppercase tracking-wider mb-2">Recommendation</p>
          <div className="text-soft text-sm leading-relaxed whitespace-pre-wrap">{feedback}</div>
        </div>
      )}
    </div>
  );
}
