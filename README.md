# mini-portfolio

A simple collection of tools for managing a little brokerage account.
The focus of this account is not for active trading, or parking funds in ETFs - it's about picking a smaller handful of bets on companies I have high conviction in.

These tools will help me manage that process.

## Getting started

```
npm install
```

Create `.env.local` before starting the app:

```bash
# Required for the Airtable-backed holdings data
AIRTABLE_API_KEY=
AIRTABLE_BASE_ID=
SCHWAB_POSITIONS_VIEW_ID=

# Needed for creating/upserting positions into the Schwab account
SCHWAB_BROKERAGE_ACCOUNT_RECORD_ID=

# Only needed for the price-history sync endpoint
ALPACA_API_KEY=
ALPACA_SECRET_KEY=

# Optional UI config
NEXT_PUBLIC_PORTFOLIO_RESET_DATE=2026-01-08
```

Then run:

```
npm run dev
```

## Environment

There are only two actual API credentials in this project:

- `AIRTABLE_API_KEY` – Airtable personal access token with access to the Finances base
- `ALPACA_API_KEY` / `ALPACA_SECRET_KEY` – only needed for price sync (IEX daily bars)

The rest are configuration values:

- `AIRTABLE_BASE_ID` – your Airtable base id (`app...`)
- `SCHWAB_POSITIONS_VIEW_ID` – Airtable Positions view id used to read Schwab holdings
- `SCHWAB_BROKERAGE_ACCOUNT_RECORD_ID` – Airtable Investment Accounts record id used when creating/upserting Schwab positions
- `NEXT_PUBLIC_PORTFOLIO_RESET_DATE` – optional reset comparison date and earliest price-history sync date (defaults to `2026-01-08`); the UI label is derived from this date

What you need for each workflow:

- Basic app / holdings list: `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`, `SCHWAB_POSITIONS_VIEW_ID`
- Creating or batch-upserting holdings: add `SCHWAB_BROKERAGE_ACCOUNT_RECORD_ID`
- Price-history sync endpoint: add `ALPACA_API_KEY` and `ALPACA_SECRET_KEY`; sync starts at `NEXT_PUBLIC_PORTFOLIO_RESET_DATE`
- One-time SQLite migration: needs the Airtable values used to read holdings and write price history (`AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`, `SCHWAB_POSITIONS_VIEW_ID`)

Yahoo Finance is used only as a fallback data source during sync and does not require a key.

Holdings are read from the Airtable **Positions** table using your configured Schwab view id. New positions link `Account` to your configured Schwab investment-account record id. Daily closes live in **Price History** (linked to Positions).

## Data refresh workflow

- Use the Chrome extension's **Import All Holdings** button from the Schwab positions page to write current position quantities, values, and cost basis into Airtable **Positions**.
- Use the app's **Sync Prices** button to write missing daily close prices from the reset date onward into Airtable **Price History**.
- The bottom **Holdings** table reads from Airtable **Positions** whenever the page loads. Refresh the page after importing from the extension to see newly imported position data.
- The history chart and reset-date comparisons read from Airtable **Price History**. Use **Sync Prices** after importing holdings so newly added tickers get historical prices.
- **Copy to Clipboard** only copies the current table to your clipboard for manual pasting. It does not write to Airtable and is not part of the normal refresh flow.

### One-time SQLite migration

If you still have a `portfolio.db` from before the Airtable migration:

```
npm run migrate:airtable
```

