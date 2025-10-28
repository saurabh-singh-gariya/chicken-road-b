import { createHmac } from 'crypto';

/**
 * Generate deterministic hazard column number for a given step
 * @param serverSeed unique server seed per session
 * @param step current step number
 * @param hazardCount total number of hazard columns
 * @param totalColumns total number of columns in the game
 * @returns deterministic hazard columns list
 */

export function generateHazardColumns(
  serverSeed: string,
  step: number,
  hazardCount: number,
  totalColumns: number,
  userSeed?: string,
  nonce?: number,
): number[] {
  // Composite message: userSeed:nonce:step when provided to enhance uniqueness & fairness auditability
  const message =
    userSeed && typeof nonce === 'number'
      ? `${userSeed}:${nonce}:${step}`
      : step.toString();
  const random = createHmac('sha256', serverSeed).update(message).digest('hex');

  const hazardColumns = new Set<number>();
  let i = 0;

  while (hazardColumns.size < hazardCount) {
    const index = parseInt(random[i % random.length], 16) % totalColumns;
    hazardColumns.add(index);
    i++;
  }

  return Array.from(hazardColumns);
}
