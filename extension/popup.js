const BATCH_API_URL = 'http://localhost:3000/api/holdings/batch';

// DOM elements
const importAllBtn = document.getElementById('importAllBtn');
const messageDiv = document.getElementById('message');

// Show message helper
function showMessage(text, type = 'info') {
  messageDiv.textContent = text;
  messageDiv.className = `message ${type}`;
  messageDiv.style.display = 'block';

  if (type === 'success') {
    setTimeout(() => {
      messageDiv.style.display = 'none';
    }, 3000);
  }
}

// Function to extract ALL holdings from page (runs in page context)
function extractAllHoldings() {
  const holdings = [];

  // Try to extract from positionsDetails table (specific structure)
  const positionsTable = document.getElementById('positionsDetails');
  if (positionsTable) {
    // Find all position rows - look for rows with app-position-row attribute or position-row class
    const allRows = positionsTable.querySelectorAll('tr[app-position-row], tr.position-row');

    console.log(`Found ${allRows.length} position rows`);

    // Process each row
    allRows.forEach((row, rowIndex) => {
      // Skip summary/total rows
      if (row.hasAttribute('app-group-totals-row') ||
          row.hasAttribute('app-account-totals-row') ||
          row.classList.contains('highlight-row')) {
        return;
      }

      const data = {
        ticker: null,
        company_name: null,
        current_price: null,
        shares: null,
        cost_basis: null,
      };

      // First, try to get ticker from data-symbol attribute (most reliable)
      const dataSymbol = row.getAttribute('data-symbol');
      if (dataSymbol) {
        data.ticker = dataSymbol.toUpperCase();
      }

      // Fallback: Extract ticker from href pattern
      if (!data.ticker) {
        const tickerLink = row.querySelector('a[href*="symbol="], a[href*="Symbol"], th.symbolColumn a, th a');
        if (tickerLink) {
          const href = tickerLink.getAttribute('href') || '';
          const hrefMatch = href.match(/symbol=([A-Z0-9%]+)/i);
          if (hrefMatch) {
            data.ticker = decodeURIComponent(hrefMatch[1]).toUpperCase();
          } else {
            const tickerText = tickerLink.textContent.trim();
            const tickerMatch = tickerText.match(/^([A-Z0-9\.\/]+)/i);
            if (tickerMatch) {
              data.ticker = tickerMatch[1].toUpperCase();
            }
          }
        }
      }

      // Skip if no ticker or ticker is "Cash" or similar non-stock items
      if (!data.ticker || data.ticker.toLowerCase() === 'cash') {
        return;
      }

      // Extract company name from title attribute or span with caption class
      const nameContainer = row.querySelector('td.holdings-name-wrap div[title], .symbol-wrapper[title]');
      if (nameContainer) {
        data.company_name = nameContainer.getAttribute('title');
      }
      if (!data.company_name) {
        const nameSpan = row.querySelector('td.holdings-name-wrap .sdps-text-caption-1, .sdps-caption-1 span');
        if (nameSpan && nameSpan.textContent.trim()) {
          data.company_name = nameSpan.textContent.trim();
        }
      }

      // Get all td cells for this row
      const allCells = Array.from(row.querySelectorAll('td'));

      // Track which data we've found
      let foundShares = false;
      let foundPrice = false;

      // Find cells by examining their content patterns
      allCells.forEach((cell) => {
        const text = cell.textContent.trim();
        const cellClass = cell.className || '';

        // Skip empty cells or cells with just dashes
        if (!text || text === '-' || text === '<!---->') {
          return;
        }

        // Check if this is a cost basis cell (has app-cost-basis-column attribute)
        if (cell.hasAttribute('app-cost-basis-column')) {
          // Get total cost basis from the cell text (e.g., "$4,318.12")
          const costText = cell.textContent.trim();
          const costMatch = costText.match(/\$?([\d,]+\.?\d*)/);
          if (costMatch) {
            data.cost_basis = parseFloat(costMatch[1].replace(/,/g, ''));
          }
          return;
        }

        // Skip cells that are clearly not data (ratings, reinvest, etc.)
        if (cell.hasAttribute('app-ratings-column') ||
            cell.hasAttribute('app-reinvest-column')) {
          return;
        }

        // Skip cells with percentage only (no dollar sign) - these are change percentages
        if (text.includes('%') && !text.includes('$')) {
          return;
        }

        // Skip cells with +/- gain/loss indicators
        if (text.startsWith('+') || text.startsWith('-$')) {
          return;
        }

        // Check for quantity - a plain number without $ or %
        // Quantity cells typically have just a number like "79.0473"
        if (!foundShares && cellClass.includes('sdps-text-right')) {
          // Match a plain number (possibly with decimals)
          const cleanedText = text.replace(/\s/g, '').replace(/,/g, '');
          if (/^\d+\.?\d*$/.test(cleanedText)) {
            const qty = parseFloat(cleanedText);
            if (qty > 0 && qty < 10000000) {
              data.shares = qty;
              foundShares = true;
              return;
            }
          }
        }

        // Check for price - has $ and is in the format $XXX.XX
        // Price cells often have a span with date title like title="01/02/2026"
        if (!foundPrice && cellClass.includes('sdps-text-right')) {
          const priceSpan = cell.querySelector('span[title]');
          if (priceSpan) {
            const title = priceSpan.getAttribute('title') || '';
            // Check if title looks like a date (indicates this is a price cell)
            if (/\d{2}\/\d{2}\/\d{4}/.test(title)) {
              const priceMatch = text.match(/\$?([\d,]+\.?\d*)/);
              if (priceMatch) {
                data.current_price = parseFloat(priceMatch[1].replace(/,/g, ''));
                foundPrice = true;
                return;
              }
            }
          }
        }
      });

      console.log(`Row ${rowIndex}: ${data.ticker}`, data);

      // Only add if we have required fields (ticker, company_name, shares, cost_basis)
      // current_price is optional
      if (data.ticker && data.company_name && data.shares && data.shares > 0 && data.cost_basis && data.cost_basis > 0) {
        holdings.push(data);
      }
    });
  }

  console.log(`Total holdings extracted: ${holdings.length}`);
  return holdings;
}

// Import all holdings from page
async function importAllHoldings() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      showMessage('Cannot extract from this page. Please navigate to your Schwab positions page.', 'error');
      return;
    }

    importAllBtn.disabled = true;
    importAllBtn.textContent = 'Importing...';

    // Inject content script to extract all holdings
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractAllHoldings,
    });

    const holdings = results[0].result;

    if (!holdings || holdings.length === 0) {
      showMessage('No holdings found on this page. Make sure you are on your Schwab positions page.', 'error');
      importAllBtn.disabled = false;
      importAllBtn.textContent = 'Import All Holdings';
      return;
    }

    console.log(`Found ${holdings.length} holdings to import:`, holdings);

    // Send all holdings to the batch API
    const response = await fetch(BATCH_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ holdings }),
    });

    if (response.ok) {
      const result = await response.json();
      const successCount = result.success || 0;
      const failedCount = result.failed || 0;

      if (successCount > 0) {
        const message = `Successfully imported ${successCount} holding${successCount !== 1 ? 's' : ''}${failedCount > 0 ? ` (${failedCount} failed)` : ''}!`;
        console.log('Import result:', result);
        showMessage(message, 'success');
        setTimeout(() => {
          window.close();
        }, 2000);
      } else {
        const errorMsg = result.errors && result.errors.length > 0
          ? result.errors[0].error
          : 'Unknown error';
        console.error('Import errors:', result.errors);
        showMessage(`Failed to import holdings. ${errorMsg}`, 'error');
      }
    } else {
      const errorData = await response.json();
      console.error('Import failed:', errorData);
      showMessage(errorData.error || 'Failed to import holdings', 'error');
    }
  } catch (error) {
    console.error('Error importing holdings:', error);
    showMessage('Error: Could not connect to the portfolio server. Make sure it\'s running on http://localhost:3000', 'error');
  } finally {
    importAllBtn.disabled = false;
    importAllBtn.textContent = 'Import All Holdings';
  }
}

// Handle import all button
if (importAllBtn) {
  importAllBtn.addEventListener('click', importAllHoldings);
}
