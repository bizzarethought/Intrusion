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
