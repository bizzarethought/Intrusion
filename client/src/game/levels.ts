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
  /** The level's picture: a rendered image, or for Pick a Side one drawn here. */
  image: HTMLImageElement | HTMLCanvasElement;
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
};

/** The glass panel under a point, if any: its column, row, name and centre. Every point over the bridge belongs to one. */
export function platformAt(x: number, y: number): { col: number; row: number; key: string; x: number; y: number } | null {
  if (x < BRIDGE.left || x >= BRIDGE.right || y < BRIDGE.top || y > BRIDGE.bottom) return null;
  const col = Math.min(6, Math.floor((x - BRIDGE.left) / BRIDGE.columnWidth));
  const row = y < BRIDGE.rowSplit ? 1 : 0;
  return { col, row, key: `${col}:${row}`, x: BRIDGE.firstX + col * BRIDGE.columnWidth, y: BRIDGE.rowY[row] };
}

/**
 * Pick a Side, on the rendered pond: the left bank is the red answer, the right bank and the
 * meadow below it the blue one. Everyone starts on a grass islet in the middle of the pond, and a
 * row of stepping stones joins it to both banks. The crossing (stones and islet, between leftX and
 * rightX, top and bottom) is neither side. Mirrors SIDES in server/src/game/minigames.ts.
 */
export const SIDES = {
  leftX: 800,
  rightX: 1672,
  top: 385,
  bottom: 615,
  midX: 1105,
  /** The strip of water the stepping stones stand in. */
  stonesTop: 440,
  stonesBottom: 545,
  stones: [[700, 480], [900, 470], [1310, 505], [1512, 478]],
  islet: { x: 1105, y: 500, rx: 180, ry: 115 },
  /** The land that wraps round the bottom of the pond is out of play: left of `gapX`, nothing below `gapY`. The stones are the only way across. */
  gapX: 1120,
  gapY: 720,
  /** Where each answer's signboard stands (the middle of its foot). */
  signs: [[300, 640], [1420, 805]],
};

/**
 * Pick a Side: the bank a position counts for ('a' red, 'b' blue), or '' on the crossing.
 * The same test as the server's sideOf.
 */
export function bankAt(x: number, y: number): '' | 'a' | 'b' {
  const crossing = x > SIDES.leftX && x < SIDES.rightX && y > SIDES.top && y < SIDES.bottom;
  return crossing ? '' : x < SIDES.midX ? 'a' : 'b';
}

/**
 * Pick a Side keeps the rendered picture and adds two things to it: the grass of each bank takes
 * its answer's colour (blades and light kept, so it is still the same meadow), and a grass islet,
 * cut from the picture's own grass, replaces the middle stepping stone as the place to start.
 */
function sideGround(art: HTMLImageElement, ground: Uint8Array | null, foreground: HTMLImageElement | null): Pick<Level, 'image' | 'collision'> {
  const image = document.createElement('canvas');
  image.width = LEVEL_WIDTH; image.height = LEVEL_HEIGHT;
  const ctx = image.getContext('2d')!;
  ctx.drawImage(art, 0, 0);
  const collision = ground ? Uint8Array.from(ground) : new Uint8Array(COLLISION_WIDTH * COLLISION_HEIGHT).fill(1);

  // Each bank's ground in its colour. The mask is the bank's walkable ground, soft at the edges,
  // fading out where the land runs on out of play instead of stopping at a line.
  const bank = (side: 'a' | 'b', colour: string) => {
    const mask = document.createElement('canvas');
    mask.width = COLLISION_WIDTH; mask.height = COLLISION_HEIGHT;
    const maskCtx = mask.getContext('2d')!;
    for (let row = 0; row < COLLISION_HEIGHT; row++) for (let column = 0; column < COLLISION_WIDTH; column++) {
      const x = column * 4, y = row * 4;
      if (!collision[row * COLLISION_WIDTH + column] || bankAt(x, y) !== side) continue;
      const fade = side === 'a' ? (SIDES.gapY + 40 - y) / 70 : y > SIDES.gapY ? (x - SIDES.gapX + 20) / 120 : 1;
      if (fade <= 0) continue;
      maskCtx.fillStyle = `rgba(0,0,0,${Math.min(1, fade)})`;
      maskCtx.fillRect(column, row, 1, 1);
    }
    const layer = document.createElement('canvas');
    layer.width = LEVEL_WIDTH; layer.height = LEVEL_HEIGHT;
    const layerCtx = layer.getContext('2d')!;
    layerCtx.drawImage(art, 0, 0);
    layerCtx.globalCompositeOperation = 'color'; layerCtx.fillStyle = colour; layerCtx.fillRect(0, 0, LEVEL_WIDTH, LEVEL_HEIGHT);
    layerCtx.globalCompositeOperation = 'source-over'; layerCtx.globalAlpha = 0.42; layerCtx.fillRect(0, 0, LEVEL_WIDTH, LEVEL_HEIGHT);
    layerCtx.globalAlpha = 1; layerCtx.globalCompositeOperation = 'destination-in';
    layerCtx.filter = 'blur(7px)'; // where a browser has no canvas filter the edge is just crisper
    layerCtx.drawImage(mask, 0, 0, LEVEL_WIDTH, LEVEL_HEIGHT);
    layerCtx.filter = 'none';
    // Roses and boulders keep their own colours, wherever they overhang the grass.
    if (foreground) { layerCtx.globalCompositeOperation = 'destination-out'; layerCtx.drawImage(foreground, 0, 0); }
    ctx.drawImage(layer, 0, 0);
  };
  bank('a', '#e8232f');
  bank('b', '#2468f2');

  // The islet: an uneven round of the bank's grass on a rim of dark soil, like the banks have.
  const { x, y, rx, ry } = SIDES.islet;
  const shore = (grow: number) => {
    ctx.beginPath();
    for (let step = 0; step <= 48; step++) {
      const angle = (step / 48) * Math.PI * 2;
      const wobble = 1 + 0.06 * Math.sin(angle * 3 + 1) + 0.04 * Math.sin(angle * 7 + 2);
      ctx.lineTo(x + Math.cos(angle) * (rx + grow) * wobble, y + Math.sin(angle) * (ry + grow) * wobble);
    }
    ctx.closePath();
  };
  ctx.save();
  ctx.filter = 'blur(10px)'; ctx.fillStyle = 'rgba(8,30,48,0.45)'; ctx.translate(0, 20); shore(6); ctx.fill(); // its shadow on the water
  ctx.restore(); ctx.save();
  ctx.filter = 'blur(2px)'; ctx.fillStyle = '#2b1d10'; ctx.translate(0, 12); shore(2); ctx.fill(); // soil
  ctx.restore(); ctx.save();
  const turf = document.createElement('canvas');
  turf.width = rx * 2 + 40; turf.height = ry * 2 + 40;
  const turfCtx = turf.getContext('2d')!;
  turfCtx.drawImage(art, 470, 70, turf.width, turf.height, 0, 0, turf.width, turf.height);
  shore(0); ctx.clip();
  ctx.drawImage(turf, x - turf.width / 2, y - turf.height / 2);
  ctx.restore();
  // Solid ground a little inside its shore, so nobody stands half off it.
  for (let row = Math.floor((y - ry) / 4); row <= (y + ry) / 4; row++) for (let column = Math.floor((x - rx) / 4); column <= (x + rx) / 4; column++) {
    if (((column * 4 - x) / (rx - 25)) ** 2 + ((row * 4 - y) / (ry - 22)) ** 2 <= 1) collision[row * COLLISION_WIDTH + column] = 1;
  }
  return { image, collision };
}

/** Solid ground by the level's collision map: white is ground; black is water, boulders and trunks. */
export function onGround(level: Level, x: number, y: number): boolean {
  if (!level.collision) return true;
  if (x < 0 || y < 0 || x >= LEVEL_WIDTH || y >= LEVEL_HEIGHT) return false;
  return level.collision[Math.floor(y / 4) * COLLISION_WIDTH + Math.floor(x / 4)] === 1;
}

/** Where the local player may walk to. (Nobody walks on the bridge or at the podium.) */
export function walkable(level: Level, x: number, y: number): boolean {
  // Keep the whole robot and its name in the picture.
  if (x < 30 || x > LEVEL_WIDTH - 30 || y < 250 || y > LEVEL_HEIGHT - 60) return false;
  if (level.id === 'side') {
    if (x < SIDES.gapX && y > SIDES.gapY) return false;
    // The row of stepping stones stands in open water. A robot in this strip is drawn on the nearest stone (see the game view), never in the water.
    if (x >= 640 && x <= SIDES.rightX + 20 && y > SIDES.stonesTop && y < SIDES.stonesBottom) return true;
  }
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
/** Browsers were told to keep level files for a week. Change this when the art changes, so they fetch the new files. */
const VERSION = '?v=3';

/** An image from the levels folder, or null if it is missing (older art has no foreground or collision map). */
const picture = (name: string) => new Promise<HTMLImageElement | null>((resolve) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = `/assets/levels/${name}${VERSION}`;
});

export function loadLevel(id: LevelId): Promise<Level> {
  let pending = cache.get(id);
  if (!pending) {
    pending = (async () => {
      const [file, image, foreground, map] = await Promise.all([
        fetch(`/assets/levels/${id}.json${VERSION}`).then((response) => response.json() as Promise<LevelFile>),
        // Backgrounds ship as JPEG, a sixth of the size; a PNG straight from the art pass still works.
        picture(`${id}_bg.jpg`).then((jpeg) => jpeg ?? picture(`${id}_bg.png`)),
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
        ...(id === 'side' ? sideGround(image, collision, foreground) : {}),
      };
    })();
    cache.set(id, pending);
    pending.catch(() => cache.delete(id)); // a failed download is tried again, not remembered
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
