export function generateColumnMultipliers(
  finalMultiplier: number,
  totalColumns: number,
): number[] {
  const multipliers: number[] = [];
  const stepInc = (finalMultiplier - 1) / (totalColumns - 1);
  for (let i = 0; i < totalColumns; i++) {
    multipliers.push(1 + i * stepInc);
  }
  return multipliers.map((m) => parseFloat(m.toFixed(2)));
}
