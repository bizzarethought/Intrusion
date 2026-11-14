/** Opt in with ?perf=1. Inspect window.intrusionPerformance in DevTools. */
export function frameProfiler() {
  const enabled = new URLSearchParams(location.search).has('perf');
  let previous = 0;
  let started = 0;
  let intervals: number[] = [];
  let cpu: number[] = [];
  return {
    begin(now: number) {
      if (!enabled) return;
      if (previous && now - previous < 1000) intervals.push(now - previous);
      previous = now;
      started = performance.now();
    },
    end(bots: number, sheets: number, resolution: number, fx?: object) {
      if (!enabled) return;
      cpu.push(performance.now() - started);
      if (intervals.length < 120) return;
      const sorted = [...intervals].sort((a, b) => a - b);
      const report = {
        fps: Math.round(1000 / (intervals.reduce((a, b) => a + b, 0) / intervals.length)),
        frameP95Ms: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2),
        cpuAverageMs: +(cpu.reduce((a, b) => a + b, 0) / cpu.length).toFixed(2),
        bots, loadedSheets: sheets, resolution, fx: fx ? { ...fx } : undefined,
      };
      Object.assign(window, { intrusionPerformance: report });
      intervals = []; cpu = [];
    },
  };
}
