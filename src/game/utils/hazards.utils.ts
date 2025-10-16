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
): number[] {
  const random = createHmac('sha256', serverSeed)
    .update(step.toString())
    .digest('hex');

  const hazardColumns = new Set<number>();
  let i = 0;

  while (hazardColumns.size < hazardCount) {
    const index = parseInt(random[i % random.length], 16) % totalColumns;
    hazardColumns.add(index);
    i++;
  }

  return Array.from(hazardColumns);
}
