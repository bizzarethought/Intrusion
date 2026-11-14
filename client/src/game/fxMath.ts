/** Ping-pong without duplicating end frames: 0,1,2,1,0... */
export function pingPongFrame(time: number, fps: number, count: number): number {
  if (count <= 1) return 0;
  const period = (count - 1) * 2;
  const step = Math.floor(Math.max(0, time) * fps) % period;
  return step < count ? step : period - step;
}

/** Closing fits inside the server's 400 ms reaction grace. Reversals keep the current pose. */
export function rosePose(current: number, open: boolean, dt: number, reducedMotion: boolean): number {
  const target = open ? 1 : 0;
  if (reducedMotion) return target;
  const step = Math.max(0, dt) / 0.3;
  return current < target ? Math.min(target, current + step) : Math.max(target, current - step);
}

export function insidePolygon(x: number, y: number, points: readonly number[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 2; i < points.length; j = i, i += 2) {
    const ax = points[i], ay = points[i + 1], bx = points[j], by = points[j + 1];
    if ((ay > y) !== (by > y) && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}
