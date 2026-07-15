const router = require('express').Router();
const pool = require('../db');
const auth = require('../middleware/auth');

const VALID_TYPES = ['Property', 'Vehicle', 'Gold', 'PPF', 'NPS'];

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

// GET / — list all other assets for user
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM other_assets WHERE user_id = $1 ORDER BY asset_type, name`,
      [req.user.id]
    );
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

// POST / — create asset
router.post('/', auth, async (req, res) => {
  try {
    const {
      account, asset_type, name,
      purchase_value, current_value, loan_outstanding, loan_emi, loan_interest_rate,
      quantity, currency = 'INR', notes, as_of_date,
    } = req.body;

    if (!VALID_TYPES.includes(asset_type)) {
      return res.status(400).json({ error: 'Invalid asset_type' });
    }
    const owned = await checkAccountOwnership(req.user.id, account);
    if (!owned) return res.status(403).json({ error: 'Account not found for this user' });

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
        as_of_date || new Date().toISOString().slice(0, 10),
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id — update asset + auto-snapshot
router.put('/:id', auth, async (req, res) => {
  try {
    const {
      account, asset_type, name,
      purchase_value, current_value, loan_outstanding, loan_emi, loan_interest_rate,
      quantity, currency = 'INR', notes, as_of_date,
    } = req.body;

    if (asset_type && !VALID_TYPES.includes(asset_type)) {
      return res.status(400).json({ error: 'Invalid asset_type' });
    }
    if (account) {
      const owned = await checkAccountOwnership(req.user.id, account);
      if (!owned) return res.status(403).json({ error: 'Account not found for this user' });
    }

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
        as_of_date || new Date().toISOString().slice(0, 10),
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });

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

module.exports = router;
