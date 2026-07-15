const router = require('express').Router();
const pool = require('../db');
const auth = require('../middleware/auth');
const { sendEmail } = require('../utils/email');

const DEFAULT_TYPES = ['Property', 'Vehicle', 'Gold', 'PPF', 'NPS'];

async function checkAccountOwnership(userId, account) {
  const { rows } = await pool.query(
    'SELECT 1 FROM user_persons WHERE user_id = $1 AND person_name = $2',
    [userId, account]
  );
  return rows.length > 0;
}

async function autoSnapshot(userId, today) {
  const { rows } = await pool.query(
    `SELECT
       COALESCE(SUM(current_value), 0)    AS other_assets_value,
       COALESCE(SUM(loan_outstanding), 0) AS other_loans
     FROM other_assets WHERE user_id = $1`,
    [userId]
  );
  const otherVal = parseFloat(rows[0].other_assets_value);
  const otherLoan = parseFloat(rows[0].other_loans);
  const netWorth = otherVal - otherLoan;
  await pool.query(
    `INSERT INTO net_worth_snapshots
       (user_id, snapshot_date, other_assets_value, other_loans, net_worth)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, snapshot_date) DO UPDATE
       SET other_assets_value = EXCLUDED.other_assets_value,
           other_loans        = EXCLUDED.other_loans,
           net_worth          = EXCLUDED.net_worth`,
    [userId, today, otherVal, otherLoan, netWorth]
  );
}

// GET / — list other assets; optional ?account= filter
router.get('/', auth, async (req, res) => {
  try {
    const { account } = req.query;
    let query = `SELECT * FROM other_assets WHERE user_id = $1`;
    const params = [req.user.id];
    if (account) {
      query += ` AND account = $2`;
      params.push(account);
    }
    query += ` ORDER BY asset_type, name`;
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /snapshots — net worth history
router.get('/snapshots', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT snapshot_date::text AS date, investments_cost, investments_mkt,
              other_assets_value, other_loans, net_worth
       FROM net_worth_snapshots
       WHERE user_id = $1
       ORDER BY snapshot_date ASC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /types — user's custom types
router.get('/types', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT type_name, color, has_loan, has_qty
       FROM user_asset_types WHERE user_id = $1 ORDER BY type_name`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /types — create or update custom type
router.post('/types', auth, async (req, res) => {
  try {
    const { type_name, color = '#9ca3af', has_loan = false, has_qty = false } = req.body;
    if (!type_name || !type_name.trim()) {
      return res.status(400).json({ error: 'type_name is required' });
    }
    if (DEFAULT_TYPES.includes(type_name.trim())) {
      return res.status(400).json({ error: 'Cannot override a built-in type' });
    }
    const { rows } = await pool.query(
      `INSERT INTO user_asset_types (user_id, type_name, color, has_loan, has_qty)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, type_name) DO UPDATE
         SET color = EXCLUDED.color, has_loan = EXCLUDED.has_loan, has_qty = EXCLUDED.has_qty
       RETURNING *`,
      [req.user.id, type_name.trim(), color, has_loan, has_qty]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /types/:name — remove custom type
router.delete('/types/:name', auth, async (req, res) => {
  try {
    const { name } = req.params;
    if (DEFAULT_TYPES.includes(name)) {
      return res.status(400).json({ error: 'Cannot delete a built-in type' });
    }
    const { rows } = await pool.query(
      `DELETE FROM user_asset_types WHERE user_id = $1 AND type_name = $2 RETURNING type_name`,
      [req.user.id, name]
    );
    if (!rows.length) return res.status(404).json({ error: 'Type not found' });
    res.json({ deleted: rows[0].type_name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / — create asset
router.post('/', auth, async (req, res) => {
  try {
    const {
      account, asset_type, name,
      purchase_value, current_value, loan_outstanding, loan_emi, loan_interest_rate,
      quantity, currency = 'INR', notes, as_of_date,
    } = req.body;

    if (!asset_type) return res.status(400).json({ error: 'asset_type is required' });
    const owned = await checkAccountOwnership(req.user.id, account);
    if (!owned) return res.status(403).json({ error: 'Account not found for this user' });

    const asOfDate = as_of_date || new Date().toISOString().slice(0, 10);
    const { rows } = await pool.query(
      `INSERT INTO other_assets
         (user_id, account, asset_type, name, purchase_value, current_value,
          loan_outstanding, loan_emi, loan_interest_rate, quantity, currency, notes, as_of_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        req.user.id, account, asset_type, name,
        purchase_value || null,
        current_value || 0,
        loan_outstanding || 0,
        loan_emi || null,
        loan_interest_rate || null,
        quantity || null,
        currency.toUpperCase(),
        notes || null,
        asOfDate,
      ]
    );
    const asset = rows[0];

    // Seed initial history record
    await pool.query(
      `INSERT INTO other_asset_history (asset_id, user_id, current_value, loan_outstanding, as_of_date)
       VALUES ($1, $2, $3, $4, $5)`,
      [asset.id, req.user.id, current_value || 0, loan_outstanding || 0, asOfDate]
    );

    res.status(201).json(asset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id — update asset + record history + auto-snapshot
router.put('/:id', auth, async (req, res) => {
  try {
    const {
      account, asset_type, name,
      purchase_value, current_value, loan_outstanding, loan_emi, loan_interest_rate,
      quantity, currency = 'INR', notes, as_of_date,
    } = req.body;

    if (account) {
      const owned = await checkAccountOwnership(req.user.id, account);
      if (!owned) return res.status(403).json({ error: 'Account not found for this user' });
    }

    const asOfDate = as_of_date || new Date().toISOString().slice(0, 10);
    const { rows } = await pool.query(
      `UPDATE other_assets SET
         account            = $3,
         asset_type         = $4,
         name               = $5,
         purchase_value     = $6,
         current_value      = $7,
         loan_outstanding   = $8,
         loan_emi           = $9,
         loan_interest_rate = $10,
         quantity           = $11,
         currency           = $12,
         notes              = $13,
         as_of_date         = $14
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [
        req.params.id, req.user.id,
        account, asset_type, name,
        purchase_value || null,
        Number(current_value) || 0,
        Number(loan_outstanding) || 0,
        loan_emi || null,
        loan_interest_rate || null,
        quantity || null,
        (currency || 'INR').toUpperCase(),
        notes || null,
        asOfDate,
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    // Record history point (upsert by date)
    await pool.query(
      `INSERT INTO other_asset_history (asset_id, user_id, current_value, loan_outstanding, as_of_date)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.params.id, req.user.id, Number(current_value) || 0, Number(loan_outstanding) || 0, asOfDate]
    );

    const today = new Date().toISOString().slice(0, 10);
    await autoSnapshot(req.user.id, today);

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM other_assets WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id/history — value history for a single asset
router.get('/:id/history', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT as_of_date::text AS date, current_value, loan_outstanding
       FROM other_asset_history
       WHERE asset_id = $1 AND user_id = $2
       ORDER BY as_of_date ASC`,
      [req.params.id, req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /snapshot — manual snapshot from client (includes investment totals)
router.post('/snapshot', auth, async (req, res) => {
  try {
    const { investments_cost = 0, investments_mkt, other_assets_value = 0, other_loans = 0, net_worth, snapshot_date } = req.body;
    const date = snapshot_date || new Date().toISOString().slice(0, 10);
    const nw = net_worth !== undefined ? net_worth : (
      (investments_mkt || investments_cost) + other_assets_value - other_loans
    );
    const { rows } = await pool.query(
      `INSERT INTO net_worth_snapshots
         (user_id, snapshot_date, investments_cost, investments_mkt, other_assets_value, other_loans, net_worth)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (user_id, snapshot_date) DO UPDATE
         SET investments_cost   = EXCLUDED.investments_cost,
             investments_mkt    = EXCLUDED.investments_mkt,
             other_assets_value = EXCLUDED.other_assets_value,
             other_loans        = EXCLUDED.other_loans,
             net_worth          = EXCLUDED.net_worth
       RETURNING *`,
      [req.user.id, date, investments_cost, investments_mkt || null, other_assets_value, other_loans, nw]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /send-update-reminder — email profiles about stale assets
router.post('/send-update-reminder', auth, async (req, res) => {
  try {
    const { rows: staleAssets } = await pool.query(
      `SELECT oa.id, oa.name, oa.asset_type, oa.current_value, oa.as_of_date,
              oa.account, up.email
       FROM other_assets oa
       JOIN user_persons up ON up.user_id = oa.user_id AND up.person_name = oa.account
       WHERE oa.user_id = $1
         AND up.email IS NOT NULL AND up.email != ''
         AND (CURRENT_DATE - oa.as_of_date::date) > 60
       ORDER BY oa.as_of_date ASC`,
      [req.user.id]
    );

    // Group stale assets by email; if none stale, still send general reminder
    const byEmail = {};
    for (const a of staleAssets) {
      if (!byEmail[a.email]) byEmail[a.email] = { person: a.account, assets: [] };
      byEmail[a.email].assets.push(a);
    }

    if (staleAssets.length === 0) {
      const { rows: profiles } = await pool.query(
        `SELECT person_name, email FROM user_persons
         WHERE user_id = $1 AND email IS NOT NULL AND email != ''`,
        [req.user.id]
      );
      for (const p of profiles) {
        const html = buildReminderHtml(p.person_name, []);
        await sendEmail(p.email, `Time to review your Illiquid Investments! 📊`, html);
      }
      return res.json({ sent: profiles.length, stale: 0 });
    }

    let sent = 0;
    for (const [email, { person, assets }] of Object.entries(byEmail)) {
      const html = buildReminderHtml(person, assets);
      await sendEmail(
        email,
        `${person}, ${assets.length} asset${assets.length > 1 ? 's need' : ' needs'} value update 📊`,
        html
      );
      sent++;
    }

    res.json({ sent, stale: staleAssets.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function buildReminderHtml(personName, staleAssets) {
  const fmtDate = (ds) => {
    if (!ds) return '—';
    const d = new Date(String(ds).slice(0, 10) + 'T12:00:00');
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const fmtAmt = (n) => {
    if (n == null) return '—';
    const v = Number(n);
    if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
    if (v >= 100000)   return `₹${(v / 100000).toFixed(2)}L`;
    return `₹${v.toLocaleString('en-IN')}`;
  };

  const rows = staleAssets.map(a => {
    const days = Math.floor(
      (Date.now() - new Date(String(a.as_of_date).slice(0, 10) + 'T12:00:00').getTime()) / 86400000
    );
    return `
      <tr>
        <td style="padding:10px 12px;font-size:13px;color:#fff;border-bottom:1px solid #2a2a2a;">${a.name}</td>
        <td style="padding:10px 12px;font-size:12px;color:#888;border-bottom:1px solid #2a2a2a;">${a.asset_type}</td>
        <td style="padding:10px 12px;font-size:13px;color:#f0c040;font-family:'Courier New',monospace;border-bottom:1px solid #2a2a2a;">${fmtAmt(a.current_value)}</td>
        <td style="padding:10px 12px;font-size:12px;color:#fb7185;border-bottom:1px solid #2a2a2a;">${fmtDate(a.as_of_date)} (${days}d ago)</td>
      </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0a;margin:0;padding:32px 16px;">
  <div style="max-width:540px;margin:0 auto;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:16px;overflow:hidden;">
    <div style="padding:28px 28px 20px;border-bottom:1px solid #2a2a2a;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
        <div style="width:34px;height:34px;background:#f0c040;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:10px;color:#0f0f0f;">IT</div>
        <span style="font-size:15px;font-weight:700;color:#fff;">InvestTrack</span>
      </div>
      <h1 style="margin:0;font-size:20px;font-weight:700;color:#fff;">📊 Update Your Asset Values</h1>
      <p style="margin:6px 0 0;font-size:13px;color:#888;">Hey ${personName}! Time to update your illiquid investment values.</p>
    </div>
    <div style="padding:24px 28px;">
      ${staleAssets.length > 0 ? `
      <p style="margin:0 0 16px;font-size:14px;color:#ccc;line-height:1.6;">
        The following assets haven't been updated in over 60 days. Log in to update their values for accurate net worth tracking.
      </p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        <thead><tr style="background:#0f0f0f;">
          <th style="padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#555;text-align:left;">Asset</th>
          <th style="padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#555;text-align:left;">Type</th>
          <th style="padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#555;text-align:left;">Last Value</th>
          <th style="padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#555;text-align:left;">Last Updated</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>` : `
      <p style="margin:0 0 16px;font-size:14px;color:#ccc;line-height:1.6;">
        It's a great time to review and update your illiquid investment values to keep your portfolio accurate.
      </p>`}
      <p style="margin:0;font-size:13px;color:#666;">Open InvestTrack → Illiquid Investments to update values.</p>
    </div>
    <div style="padding:16px 28px;border-top:1px solid #2a2a2a;font-size:11px;color:#555;">
      InvestTrack · Monthly Asset Update Reminder
    </div>
  </div>
</body>
</html>`;
}

module.exports = router;
