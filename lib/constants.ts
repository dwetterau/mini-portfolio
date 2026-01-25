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
export const PORTFOLIO_RESET_DATE = '2026-01-08';

/**
 * Human-readable label for the reset point date
 * Used in UI toggles and labels
 */
export const PORTFOLIO_RESET_DATE_LABEL = 'Jan 8th Value';
