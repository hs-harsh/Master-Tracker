# H&K Investment Tracker

A private investment tracker dashboard for Harsh & Kirti. Built with React + Express + PostgreSQL, deployed on Railway.

## Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Recharts
- **Backend**: Node.js, Express
- **Database**: PostgreSQL
- **Hosting**: Railway (auto-deploy from GitHub)

## Features

- 📊 **Dashboard** — Side-by-side net worth, asset allocation, risk profile for Harsh & Kirti
- 💰 **Cashflow** — Monthly income/expense entry and editing with charts
- 🧾 **Transactions** — Raw cashflow log with filters (Major / Non-Recurring / Trips)
- 📈 **Portfolio** — Broker-wise holdings tracker with growth charts (Groww, IBKR, Zerodha, Coin)

---

## 🚀 Deploy to Railway (Step by Step)

### 1. Push to GitHub

```bash
cd investment-tracker
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/investment-tracker.git
git push -u origin main
```

### 2. Create Railway Project

1. Go to [railway.app](https://railway.app) and sign in
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your `investment-tracker` repo
4. Railway will auto-detect the build config

### 3. Add PostgreSQL

1. In your Railway project, click **+ New** → **Database** → **Add PostgreSQL**
2. Railway automatically sets `DATABASE_URL` in your environment

### 4. Set Environment Variables

In Railway → your service → **Variables**, add:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | (any long random string, e.g. `openssl rand -hex 32`) |
| `APP_PASSWORD` | your chosen login password |

> `DATABASE_URL` and `PORT` are set automatically by Railway — do not override them.

### 5. Seed the Database

After first deploy, open Railway's shell for your service and run:

```bash
cd server && node db/seed.js
```

This loads all your Excel data into PostgreSQL.

### 6. Access the App

Railway gives you a public URL like `https://investment-tracker-production.up.railway.app`

Login with:
- **Username**: `admin`  
- **Password**: whatever you set in `APP_PASSWORD`

---

## 🛠️ Local Development

```bash
# Install all dependencies
npm run install:all

# Create server/.env from example
cp .env.example server/.env
# Edit server/.env with your local PostgreSQL credentials

# Run both frontend and backend
npm run dev
```

Frontend: http://localhost:5173  
Backend API: http://localhost:3001/api

### Seed local DB

```bash
cd server && node db/seed.js
```

---

## 📁 Project Structure

```
investment-tracker/
├── client/              # React frontend (Vite)
│   └── src/
│       ├── pages/       # Dashboard, Cashflow, Transactions, Portfolio
│       ├── components/  # Layout, shared components
│       ├── hooks/       # useAuth
│       └── lib/         # api.js, utils.js
├── server/              # Express backend
│   ├── routes/          # auth, cashflow, transactions, portfolio
│   ├── middleware/      # JWT auth
│   └── db/              # schema.sql, seed.js, connection
├── railway.json         # Railway config
└── nixpacks.toml        # Build config
```

---

## 🔐 Security Notes

- Change `JWT_SECRET` to a strong random value before deploying
- Change `APP_PASSWORD` to something only you know
- The app has no public registration — only the seeded `admin` user can log in
- All API routes are protected by JWT authentication

---

## 📊 Adding New Data

**Monthly Cashflow**: Go to Cashflow page → click **Add Month** → fill in the form → Save

**Transactions**: Go to Transactions page → click **Add Transaction**

**Portfolio Updates**: Go to Portfolio page → click the edit icon on any holding

---

## 🔄 Re-seeding

If you need to reload from Excel data:

```bash
cd server && node db/seed.js
```

Note: Seed uses `ON CONFLICT DO NOTHING` so it won't duplicate existing data.
