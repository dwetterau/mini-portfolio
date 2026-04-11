mini-portfolio
=====

A simple collection of tools for managing a little brokerage account.
The focus of this account is not for active trading, or parking funds in ETFs - it's about picking a smaller handful of bets on companies I have high conviction in.

These tools will help me manage that process.


## Getting started

```
npm install
npm run dev
```

## Environment

Create `.env.local` with:

- `AIRTABLE_API_KEY` – personal access token with access to the Finances base
- `AIRTABLE_BASE_ID` – your Airtable base id (`app...`)
- `ALPACA_API_KEY` / `ALPACA_SECRET_KEY` – for price sync (IEX daily bars)
- `SCHWAB_POSITIONS_VIEW_ID` – Airtable Positions view id for Schwab holdings
- `SCHWAB_BROKERAGE_ACCOUNT_RECORD_ID` – Airtable Investment Accounts record id for Schwab Brokerage
- `PRICE_HISTORY_START_DATE` – earliest date to sync (YYYY-MM-DD)
- `NEXT_PUBLIC_PORTFOLIO_RESET_DATE` / `NEXT_PUBLIC_PORTFOLIO_RESET_DATE_LABEL` – reset comparison config

Holdings are read from the Airtable **Positions** table using your configured Schwab view id. New positions link `Account` to your configured Schwab investment-account record id. Daily closes live in **Price History** (linked to Positions).

### One-time SQLite migration

If you still have a `portfolio.db` from before the Airtable migration:

```
npm run migrate:airtable
```