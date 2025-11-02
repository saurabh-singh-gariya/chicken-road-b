/**
 * Utility helpers for formatting numbers sent to the frontend.
 * Requirement: All UI-facing numeric values (except lineNumber) must be strings.
 * Internal logic remains numeric.
 */

/** Format monetary or balance value to 2 decimal places as string */
export function formatMoney(value: number): string {
  return Number(value).toFixed(2);
}

/** Format bet amount preserving higher precision (up to 9 decimal places) */
export function formatBet(value: number): string {
  return Number(value).toFixed(9); // UI expects e.g. 0.600000000
}

/** Format coefficient (multiplier). Keep raw without rounding unless fractional; min 0 */
export function formatCoeff(value: number): string {
  if (!Number.isFinite(value)) return '0';
  // Preserve up to 9 decimals but trim trailing zeros.
  const fixed = value.toFixed(9);
  return fixed.replace(/\.?(0+)$/, '').length === 0
    ? '0'
    : fixed.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
}

/** Generic number -> string pass-through without formatting (for identifiers, counts) */
export function formatInteger(value: number): string {
  return Math.trunc(value).toString();
}

/** Profit can be negative, keep 2 decimals */
export function formatProfit(value: number): string {
  return Number(value).toFixed(2);
}

/** Convert any numeric-like input to number safely; returns 0 if NaN */
export function toNumberSafe(input: unknown): number {
  if (typeof input === 'number') return input;
  if (typeof input === 'string' && input.trim() !== '') {
    const n = Number(input);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}
