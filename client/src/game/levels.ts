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
 * Pick a Side: three platforms in a pond. Red on the left and blue on the right are the two
 * answers; everyone starts on the grass one in the middle, and a line of stepping stones joins
 * them. Mirrors SIDES in server/src/game/minigames.ts.
 */
export const SIDES = {
  red: { x: 90, y: 470, width: 480, height: 440 },
  blue: { x: 1350, y: 470, width: 480, height: 440 },
  middle: { x: 770, y: 500, width: 380, height: 340 },
  pathY: 670,
  stones: [[620, 670], [720, 670], [1200, 670], [1300, 670]],
  /** The back of each coloured platform is kept clear, so a name tag never hides behind the answer sign above it. */
  signStrip: 100,
  water: 0x2f8fc2, // the pond, also shown above and below the level in a tall window
};

/** Pick a Side: the platform a position counts for ('a' red, 'b' blue), or '' in the middle or on the stones. Same test as the server's sideOf. */
export function bankAt(x: number): '' | 'a' | 'b' {
  return x < SIDES.red.x + SIDES.red.width ? 'a' : x > SIDES.blue.x ? 'b' : '';
}

/**
 * Pick a Side is drawn here, not rendered: the art pass had one pond with uneven banks, and the
 * game needs two clear places to stand. The platforms and stones are cut from that picture's own
 * grass and stones, so it still belongs with the other levels.
 */
function sideBoard(art: HTMLImageElement): Pick<Level, 'image' | 'collision' | 'foreground' | 'occluders'> {
  const image = document.createElement('canvas');
  image.width = LEVEL_WIDTH; image.height = LEVEL_HEIGHT;
  const ctx = image.getContext('2d')!;
  const water = ctx.createLinearGradient(0, 0, 0, LEVEL_HEIGHT);
  // The top and bottom edges match SIDES.water, which fills the rest of a tall window.
  water.addColorStop(0, '#2f8fc2'); water.addColorStop(0.45, '#46a8d6'); water.addColorStop(1, '#2f8fc2');
  ctx.fillStyle = water; ctx.fillRect(0, 0, LEVEL_WIDTH, LEVEL_HEIGHT);

  // The picture's own grass, laid down as soft overlapping patches, so it never repeats in a pattern.
  const patch = document.createElement('canvas');
  patch.width = 160; patch.height = 120;
  const patchCtx = patch.getContext('2d')!;
  let seed = 11;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const platform = ({ x, y, width, height }: typeof SIDES.red, colour: string | null, side: string) => {
    ctx.fillStyle = side; // the platform's edge, so it stands out of the water
    ctx.beginPath(); ctx.roundRect(x, y + 22, width, height, 26); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.roundRect(x, y, width, height, 26); ctx.clip();
    ctx.fillStyle = '#3d6a22'; ctx.fillRect(x, y, width, height);
    for (let i = 0; i < (width * height) / 1400; i++) {
      patchCtx.globalCompositeOperation = 'source-over';
      patchCtx.clearRect(0, 0, 160, 120);
      patchCtx.drawImage(art, 520 + random() * 140, 70 + random() * 110, 160, 120, 0, 0, 160, 120);
      const fade = patchCtx.createRadialGradient(80, 60, 25, 80, 60, 80);
      fade.addColorStop(0, '#000'); fade.addColorStop(1, 'transparent');
      patchCtx.globalCompositeOperation = 'destination-in';
      patchCtx.fillStyle = fade; patchCtx.fillRect(0, 0, 160, 120);
      ctx.drawImage(patch, x - 80 + random() * width, y - 60 + random() * height);
    }
    if (colour) {
      // The grass keeps its blades and light, and takes the answer's colour.
      ctx.globalCompositeOperation = 'color'; ctx.fillStyle = colour; ctx.fillRect(x, y, width, height);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.45; ctx.fillRect(x, y, width, height);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.roundRect(x + 4, y + 4, width - 8, height - 8, 22); ctx.stroke();
  };
  platform(SIDES.red, '#e8232f', '#6e1016');
  platform(SIDES.blue, '#2468f2', '#102c78');
  platform(SIDES.middle, null, '#3b2a18');
  // The picture's second stepping stone (a short cylinder at 902, 455), stamped along the path.
  for (const [x, y] of SIDES.stones) {
    ctx.save();
    ctx.translate(x, y); ctx.scale(0.62, 0.62);
    ctx.beginPath(); ctx.ellipse(0, 0, 68, 39, 0, Math.PI, 0); ctx.lineTo(68, 26); ctx.ellipse(0, 26, 68, 39, 0, 0, Math.PI); ctx.closePath();
    ctx.clip();
    ctx.drawImage(art, 902 - 80, 455 - 50, 160, 130, -80, -50, 160, 130);
    ctx.restore();
  }
  const collision = new Uint8Array(COLLISION_WIDTH * COLLISION_HEIGHT);
  for (const { x, y, width, height } of [SIDES.red, SIDES.blue, SIDES.middle]) {
    // A little inside the edge, so nobody stands half off a platform.
    const top = y + (y === SIDES.middle.y ? 12 : SIDES.signStrip);
    for (let row = Math.ceil(top / 4); row < (y + height - 12) / 4; row++) collision.fill(1, row * COLLISION_WIDTH + Math.ceil((x + 16) / 4), row * COLLISION_WIDTH + Math.floor((x + width - 16) / 4));
  }
  return { image, collision, foreground: null, occluders: [] };
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
  // The line of stepping stones crosses open water. A robot on it is drawn on the nearest stone (see the game view).
  if (level.id === 'side' && Math.abs(y - SIDES.pathY) < 40 && x > SIDES.red.x + SIDES.red.width - 20 && x < SIDES.blue.x + 20) return true;
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
        ...(id === 'side' ? sideBoard(image) : {}),
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
