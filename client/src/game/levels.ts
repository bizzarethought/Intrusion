// The pre-rendered levels from the art handoff (public/assets/levels). Each is
// one 1920x1080 image seen from 38 degrees above the ground, plus a JSON file
// with its scale and spawn points. All positions here are pixels on that image.

export const LEVEL_WIDTH = 1920;
export const LEVEL_HEIGHT = 1080;
/** Moving "up the screen" covers less of the image than moving sideways, because of the camera tilt. */
const DEPTH_SQUASH = Math.sin((38 * Math.PI) / 180);

export type LevelId = 'oak' | 'rlgl' | 'bridge' | 'podium' | 'side';
export type Spot = { x: number; y: number };

export type Level = {
  id: LevelId;
  image: HTMLImageElement;
  pixelsPerMeter: number;
  /** How tall a robot's body is drawn on this level. */
  botHeight: number;
  spawns: Spot[];
};

/** Which level each mini-game is played on. Anything else (lobby, votes) uses the oak. */
export const LEVEL_FOR_GAME: Record<string, LevelId> = {
  'red-light-green-light': 'rlgl',
  'pick-a-side': 'side',
  'prompt-podium': 'podium',
  'glass-bridge-memory': 'bridge',
};

/** Red Light, Green Light: run left to right from one line of roses to the other. */
export const RLGL = {
  startX: 250, // the field starts a robot's width past the left rose line
  finishX: 1590, // just left of the right rose line
  laneTop: 480,
  laneBottom: 870,
  /** The giant rose that watches the field. */
  watcher: { x: 1790, y: 410, radius: 230 },
};

/** Glass Bridge: seven columns of two glass panels between the banks. Mirrors BRIDGE in server/src/game/minigames.ts. */
export const BRIDGE = {
  firstX: 596.4, // centre of the first column
  columnWidth: 145.45,
  rowY: [568.7, 470.2], // centre of row 0 (nearer) and row 1 (further)
  rowSplit: 519.5,
  left: 523.7, // where the left bank ends and the glass starts
  right: 1541.8,
  top: 421,
  bottom: 618,
  panelWidth: 124,
  panelHeight: 86,
};

/** Pick a Side: the rose bank, the boulder bank, and the stepping stones between. */
export const SIDES = {
  leftX: 760,
  rightX: 1600,
  stones: [[700, 480], [900, 470], [1105, 490], [1310, 505], [1512, 478]],
};

/** The platform (glass panel or stepping stone) under a point, if any: its name and centre. */
export function platformAt(level: LevelId, x: number, y: number): { key: string; x: number; y: number } | null {
  if (level === 'bridge' && x >= BRIDGE.left && x < BRIDGE.right && y >= BRIDGE.top && y <= BRIDGE.bottom) {
    const col = Math.min(6, Math.floor((x - BRIDGE.left) / BRIDGE.columnWidth));
    const row = y < BRIDGE.rowSplit ? 1 : 0;
    const centre = { x: BRIDGE.firstX + col * BRIDGE.columnWidth, y: BRIDGE.rowY[row] };
    // Only the middle of a panel counts as standing on it, as on the server.
    return Math.abs(x - centre.x) < BRIDGE.columnWidth * 0.36 && Math.abs(y - centre.y) < 34 ? { key: `${col}:${row}`, ...centre } : null;
  }
  if (level === 'side') {
    const stone = SIDES.stones.find(([sx, sy]) => Math.hypot(x - sx, (y - sy) / DEPTH_SQUASH) < 95);
    if (stone) return { key: `stone-${stone[0]}`, x: stone[0], y: stone[1] };
  }
  return null;
}

/**
 * Where a robot may stand. The art has no collision maps yet, so these are
 * rough hand-drawn shapes: stay on the grass, out of the water.
 */
export function walkable(level: LevelId, x: number, y: number): boolean {
  if (x < 30 || x > LEVEL_WIDTH - 30 || y < 250 || y > LEVEL_HEIGHT - 60) return false;
  if (level === 'rlgl') {
    if (y < 310 || y > 930) return false; // top bank and the water along the bottom
    if (x > 980 && x < 1650 && y < 470) return false; // the pond
    if (x > 1640 && Math.hypot(x - RLGL.watcher.x, y - RLGL.watcher.y) < 190) return false; // the giant rose
  }
  if (level === 'bridge') {
    if (x < BRIDGE.left) return y > 290 && y < 650; // left bank
    if (x < BRIDGE.right) return y >= BRIDGE.top && y <= BRIDGE.bottom; // over the water there is only the bridge
    return y > 380 && y < 900 && Math.hypot(x - 1720, y - 460) > 110; // right bank, around its rose
  }
  if (level === 'side') {
    if (x < SIDES.leftX && y > 250 && y < 690 && !(x < 450 && y < 290)) return true; // rose bank, below the giant rose
    if (x > SIDES.rightX && y > 430 && y < 1020) return true; // boulder bank
    return x >= 640 && x <= 1620 && y > 440 && y < 545; // the stepping stones
  }
  return true;
}

type LevelFile = { pixels_per_meter?: number; bot_height_px?: number; spawn_points?: Array<{ px?: [number, number] }> };
const cache = new Map<LevelId, Promise<Level>>();

export function loadLevel(id: LevelId): Promise<Level> {
  let pending = cache.get(id);
  if (!pending) {
    pending = (async () => {
      const [file, image] = await Promise.all([
        fetch(`/assets/levels/${id}.json`).then((response) => response.json() as Promise<LevelFile>),
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error(`level image ${id} is missing`));
          img.src = `/assets/levels/${id}_bg.png`;
        }),
      ]);
      const spawns = (file.spawn_points ?? []).flatMap((point) => (point.px ? [{ x: point.px[0], y: point.px[1] }] : []));
      return { id, image, pixelsPerMeter: file.pixels_per_meter ?? 270, botHeight: file.bot_height_px ?? 165, spawns };
    })();
    cache.set(id, pending);
  }
  return pending;
}

// The server thinks in metres from the middle of the level; the screen thinks in pixels.
export const toMeters = (level: Level, spot: Spot) => ({
  x: (spot.x - LEVEL_WIDTH / 2) / level.pixelsPerMeter,
  z: (spot.y - LEVEL_HEIGHT / 2) / (level.pixelsPerMeter * DEPTH_SQUASH),
});
export const toPixels = (level: Level, x: number, z: number): Spot => ({
  x: LEVEL_WIDTH / 2 + x * level.pixelsPerMeter,
  y: LEVEL_HEIGHT / 2 + z * level.pixelsPerMeter * DEPTH_SQUASH,
});
export { DEPTH_SQUASH };
