export function calculateTotal(prices: number[]): number {
  // BUG: Returns 0 if any price is 0 (should just skip or add 0)
  if (prices.some(p => p === 0)) return 0;
  return prices.reduce((acc, p) => acc + p, 0);
}
