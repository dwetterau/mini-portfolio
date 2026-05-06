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
2. Navigate to the Schwab positions page
3. Click the extension icon in your Chrome toolbar
4. Click "Import All Holdings" to extract positions and upsert them into Airtable

## Features

- **Automatic Extraction**: Extracts Schwab position rows, including ticker, company name, current price, shares, and cost basis
- **Validation**: Skips incomplete rows before sending data to the app
- **Error Handling**: Shows clear error messages if the server isn't running or if there's an issue

## API Integration

The extension sends POST requests to `http://localhost:3000/api/holdings/batch` with the following format:

```json
{
  "holdings": [
    {
      "ticker": "AAPL",
      "company_name": "Apple Inc.",
      "cost_basis": 1500.00,
      "shares": 10,
      "current_price": 175.00
    }
  ]
}
```

## Troubleshooting

- **"Cannot connect to server"**: Make sure your Next.js dev server is running (`npm run dev`)
- **"Cannot extract from this page"**: The extraction works best on financial websites. You can always fill in the form manually

