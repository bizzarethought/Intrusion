// The pre-rendered levels from the art handoff (public/assets/levels). Each is
// one 1920x1080 image seen from 38 degrees above the ground, with a JSON file
// (scale, spawn points, things to walk behind), a foreground layer and a
// collision map. All positions here are pixels on that image.

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
  /** The things a robot can walk behind, as one transparent image the size of the level. */
  foreground: HTMLImageElement | null;
  /** Rectangles of `foreground` to draw in depth order with the robots; `baseY` is where each touches the ground. */
  occluders: Array<{ x: number; y: number; width: number; height: number; baseY: number }>;
  /** One byte per cell of the 480x270 collision map: 1 where a robot may stand. */
  collision: Uint8Array | null;
  /** Red Light, Green Light: where the watching rose is drawn. */
  watcher: Spot | null;
};
export const COLLISION_WIDTH = 480;
export const COLLISION_HEIGHT = 270;

/** Which level each mini-game is played on. Anything else (lobby, votes) uses the oak. */
export const LEVEL_FOR_GAME: Record<string, LevelId> = {
  'red-light-green-light': 'rlgl',
  'pick-a-side': 'side',
  'prompt-podium': 'podium',
  'glass-bridge-memory': 'bridge',
};

/** Red Light, Green Light: run left to right from one line of roses to the other. */
export const RLGL = {
  startX: 215, // the field starts a robot's width past the left rose line
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
  /** How far left of the glass a player may reach from the bank: the grass does not touch the near row, so this is the step onto it. */
  apron: 75,
};

/** Glass Bridge: true over the water between the banks, where a robot is on a panel or about to step onto one. */
export function overBridge(level: Level, x: number, y: number): boolean {
  if (x >= BRIDGE.right || y < BRIDGE.top || y > BRIDGE.bottom) return false;
  return x >= BRIDGE.left || (x >= BRIDGE.left - BRIDGE.apron && !onGround(level, x, y));
}

/**
 * Pick a Side: the red bank on the left, the blue bank on the right, and one row of stepping
 * stones across the pond between (from leftX to rightX). Nothing below `bottom` is in play, so
 * the stones are the only way across, and any grass a robot stands on belongs to one bank or the
 * other. Mirrors SIDES in server/src/game/minigames.ts.
 */
export const SIDES = {
  leftX: 745,
  rightX: 1672,
  stonesTop: 440,
  stonesBottom: 545,
  bottom: 720,
  stones: [[700, 480], [900, 470], [1105, 490], [1310, 505], [1512, 478]],
};

/** The glass panel under a point, if any: its name and centre. */
export function platformAt(level: LevelId, x: number, y: number): { key: string; x: number; y: number } | null {
  if (level === 'bridge' && x >= BRIDGE.left && x < BRIDGE.right && y >= BRIDGE.top && y <= BRIDGE.bottom) {
    const col = Math.min(6, Math.floor((x - BRIDGE.left) / BRIDGE.columnWidth));
    const row = y < BRIDGE.rowSplit ? 1 : 0;
    const centre = { x: BRIDGE.firstX + col * BRIDGE.columnWidth, y: BRIDGE.rowY[row] };
    // Only the middle of a panel counts as standing on it, as on the server.
    return Math.abs(x - centre.x) < BRIDGE.columnWidth * 0.36 && Math.abs(y - centre.y) < 34 ? { key: `${col}:${row}`, ...centre } : null;
  }
  return null;
}

/**
 * Pick a Side: the bank a player's position counts for ('a' left, 'b' right), or '' on the stones.
 * The same test as the server's sideOf: off the row of stones, left of the middle stone is the left bank.
 */
export function bankAt(x: number, y: number): '' | 'a' | 'b' {
  const onStones = x > SIDES.leftX && x < SIDES.rightX && y > SIDES.stonesTop && y < SIDES.stonesBottom;
  return onStones ? '' : x < SIDES.stones[2][0] ? 'a' : 'b';
}

/** Solid ground by the level's collision map: white is ground; black is water, boulders and trunks. */
export function onGround(level: Level, x: number, y: number): boolean {
  if (!level.collision) return true;
  if (x < 0 || y < 0 || x >= LEVEL_WIDTH || y >= LEVEL_HEIGHT) return false;
  return level.collision[Math.floor(y / 4) * COLLISION_WIDTH + Math.floor(x / 4)] === 1;
}

/** Where the local player may move to. */
export function walkable(level: Level, x: number, y: number): boolean {
  // Keep the whole robot and its name in the picture.
  if (x < 30 || x > LEVEL_WIDTH - 30 || y < 250 || y > LEVEL_HEIGHT - 60) return false;
  if (level.id === 'side') {
    if (y > SIDES.bottom) return false;
    // The row of stepping stones crosses the pond, which the map marks as water. A robot in this
    // strip is drawn on the nearest stone (see the game view), never in the water.
    if (x >= 640 && x <= SIDES.rightX + 20 && y > SIDES.stonesTop && y < SIDES.stonesBottom) return true;
  }
  if (level.id === 'bridge' && overBridge(level, x, y)) return true;
  return onGround(level, x, y);
}

type LevelFile = {
  pixels_per_meter?: number;
  bot_height_px?: number;
  spawn_points?: Array<{ px?: [number, number] }>;
  occluders?: Array<{ box_px?: [number, number, number, number]; base_y_px?: number }>;
  watcher_rose?: { centre_px?: [number, number] };
};
const cache = new Map<LevelId, Promise<Level>>();

/** An image from the levels folder, or null if it is missing (older art has no foreground or collision map). */
const picture = (name: string) => new Promise<HTMLImageElement | null>((resolve) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = `/assets/levels/${name}`;
});

export function loadLevel(id: LevelId): Promise<Level> {
  let pending = cache.get(id);
  if (!pending) {
    pending = (async () => {
      const [file, image, foreground, map] = await Promise.all([
        fetch(`/assets/levels/${id}.json`).then((response) => response.json() as Promise<LevelFile>),
        picture(`${id}_bg.png`),
        picture(`${id}_fg.png`),
        picture(`${id}_collision.png`),
      ]);
      if (!image) throw new Error(`level image ${id} is missing`);
      const spawns = (file.spawn_points ?? []).flatMap((point) => (point.px ? [{ x: point.px[0], y: point.px[1] }] : []));
      // Boxes can hang over the edge of the picture; keep the part that is on it.
      const occluders = (file.occluders ?? []).flatMap(({ box_px: box, base_y_px: baseY }) => {
        if (!box || baseY === undefined) return [];
        const x = Math.max(0, box[0]), y = Math.max(0, box[1]);
        const width = Math.min(LEVEL_WIDTH, box[2]) - x, height = Math.min(LEVEL_HEIGHT, box[3]) - y;
        return width > 0 && height > 0 ? [{ x, y, width, height, baseY }] : [];
      });
      let collision: Uint8Array | null = null;
      if (map) {
        const canvas = document.createElement('canvas');
        canvas.width = COLLISION_WIDTH; canvas.height = COLLISION_HEIGHT;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(map, 0, 0, COLLISION_WIDTH, COLLISION_HEIGHT);
        const pixels = ctx.getImageData(0, 0, COLLISION_WIDTH, COLLISION_HEIGHT).data;
        collision = Uint8Array.from({ length: COLLISION_WIDTH * COLLISION_HEIGHT }, (_, i) => Number(pixels[i * 4] > 127));
      }
      const rose = file.watcher_rose?.centre_px;
      return {
        id, image, foreground, occluders, collision,
        pixelsPerMeter: file.pixels_per_meter ?? 270, botHeight: file.bot_height_px ?? 165, spawns,
        watcher: rose ? { x: rose[0], y: rose[1] } : null,
      };
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
