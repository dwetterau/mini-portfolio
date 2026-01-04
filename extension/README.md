# Portfolio Holding Extractor Chrome Extension

This Chrome extension allows you to extract holding information from financial websites and save it directly to your portfolio database.

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in the top right)
3. Click "Load unpacked"
4. Select the `extension` directory from this project
5. The extension icon should appear in your toolbar

## Usage

1. Make sure your Next.js portfolio server is running on `http://localhost:3000`
2. Navigate to a financial website (e.g., Yahoo Finance, Google Finance)
3. Click the extension icon in your Chrome toolbar
4. Click "Extract from Page" to automatically extract available data (ticker, company name, current price)
5. Fill in any remaining fields (cost basis, shares, etc.)
6. Click "Save to Portfolio" to save the holding to your database

## Features

- **Automatic Extraction**: Attempts to extract ticker symbol, company name, and current price from common financial websites
- **Manual Entry**: You can always fill in the form manually if extraction doesn't work
- **Validation**: Ensures all required fields are filled before saving
- **Error Handling**: Shows clear error messages if the server isn't running or if there's an issue

## API Integration

The extension sends POST requests to `http://localhost:3000/api/holdings` with the following format:

```json
{
  "ticker": "AAPL",
  "company_name": "Apple Inc.",
  "cost_basis": 150.00,
  "shares": 10,
  "current_price": 175.00
}
```

## Troubleshooting

- **"Cannot connect to server"**: Make sure your Next.js dev server is running (`npm run dev`)
- **"Cannot extract from this page"**: The extraction works best on financial websites. You can always fill in the form manually

