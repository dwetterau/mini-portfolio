import { format, isValid, parseISO } from 'date-fns';

/**
 * Portfolio Reset Point Configuration
 *
 * This date is used as an alternative "cost basis" reference point for performance calculations.
 * When the user toggles to "reset point" mode, gain/loss is calculated from this date's
 * closing price instead of the actual cost basis.
 *
 * This is useful for measuring performance from a specific point in time (e.g., start of year,
 * after a major portfolio rebalance, etc.) rather than from the original purchase date.
 *
 * TODO: Make this user-configurable in the future
 */
export const PORTFOLIO_RESET_DATE = process.env.NEXT_PUBLIC_PORTFOLIO_RESET_DATE || '2026-01-08';

function formatResetDateLabel(date: string): string {
  const parsedDate = parseISO(date);

  if (!isValid(parsedDate)) {
    return 'Reset Date Value';
  }

  return format(parsedDate, "MMM do 'Value'");
}

function formatResetDateDisplay(date: string): string {
  const parsedDate = parseISO(date);

  if (!isValid(parsedDate)) {
    return 'Reset Date';
  }

  return format(parsedDate, 'MMM do');
}

/**
 * Human-readable label for the reset point date
 * Used in UI toggles and labels
 */
export const PORTFOLIO_RESET_DATE_LABEL = formatResetDateLabel(PORTFOLIO_RESET_DATE);
export const PORTFOLIO_RESET_DATE_DISPLAY = formatResetDateDisplay(PORTFOLIO_RESET_DATE);
