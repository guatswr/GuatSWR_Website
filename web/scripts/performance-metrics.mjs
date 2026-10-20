/** Three valid samples; score and LCP have independent median orderings. */
export function summarizePerformance(runs) {
  if (!Array.isArray(runs) || runs.length !== 3 || runs.some(run =>
    !Number.isFinite(run?.performance) || run.performance < 0 || run.performance > 100
    || !Number.isFinite(run?.lcpMs) || run.lcpMs <= 0)) throw new Error('Expected exactly three valid performance samples')
  const byLcp = [...runs].sort((a, b) => a.lcpMs - b.lcpMs)
  const scores = runs.map(run => run.performance).sort((a, b) => a - b)
  return { median: { performance: scores[1], lcpMs: byLcp[1].lcpMs }, lcpMedianSample: byLcp[1] }
}
