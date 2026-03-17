export function findMax(nums: number[]): number {
  // PERF: Sorting to find max is O(n log n) instead of O(n)
  if (nums.length === 0) return 0;
  return [...nums].sort((a, b) => b - a)[0];
}
