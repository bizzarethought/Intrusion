// Gameplay sprites (public/assets/topdown): the ten robots rendered from the
// same 38-degree angle as the levels. Each sheet is an 8x6 grid of 360 px cells.
//
// A sheet is 25 MB once decoded, so each one is shrunk to two-thirds size and
// tinted warm (the levels are warm and slightly dim; the sprites are lit
// neutrally) once, as it loads. Only looks that are on screen get loaded.

const SHRINK = 2 / 3;
/** Multiplied into every sprite so the robots sit in the level's light. */
const LEVEL_TINT = [0.87, 0.81, 0.71]; // red, green, blue

/** Sizes in the original sheet. */
export const CELL = 360;
/** Height of a robot's body (no accessory) inside a cell. Levels size robots by this. */
export const BODY_HEIGHT = 235;
/** Where the feet touch the ground inside a cell. */
export const ANCHOR = { x: 0.5, y: 0.788 };

export type BotSheet = {
  image: HTMLCanvasElement;
  /** Cell size in `image`. */
  cell: number;
  /** Top-left of each frame in `image`. */
  frames: Record<string, { x: number; y: number }>;
  animations: Record<string, string[]>;
  fps: Record<string, number>;
};

type AtlasFile = {
  frames?: Record<string, { frame?: { x: number; y: number } }>;
  animations?: Record<string, string[]>;
  meta?: { fps?: Record<string, number> };
};

const cache = new Map<string, BotSheet | null>();
const loading = new Set<string>();

/** The sheet for a look if it has loaded, otherwise undefined (and loading starts). */
export function botSheet(look: string): BotSheet | null | undefined {
  if (!cache.has(look) && !loading.has(look)) {
    loading.add(look);
    load(look).catch(() => null).then((sheet) => cache.set(look, sheet));
  }
  return cache.get(look);
}

async function load(look: string): Promise<BotSheet | null> {
  const [fileResponse, sheetResponse] = await Promise.all([fetch(`/assets/topdown/bot_${look}.json`), fetch(`/assets/topdown/bot_${look}.png`)]);
  if (!fileResponse.ok || !sheetResponse.ok) return null;
  const file = (await fileResponse.json()) as AtlasFile;
  const full = await createImageBitmap(await sheetResponse.blob());
  const image = document.createElement('canvas');
  image.width = Math.round(full.width * SHRINK);
  image.height = Math.round(full.height * SHRINK);
  const ctx = image.getContext('2d')!;
  ctx.drawImage(full, 0, 0, image.width, image.height);
  full.close();
  // Tint every pixel's colour and leave its transparency alone, so the soft baked shadow stays soft.
  const pixels = ctx.getImageData(0, 0, image.width, image.height);
  const data = pixels.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] *= LEVEL_TINT[0];
    data[i + 1] *= LEVEL_TINT[1];
    data[i + 2] *= LEVEL_TINT[2];
  }
  ctx.putImageData(pixels, 0, 0);

  const frames: BotSheet['frames'] = {};
  for (const [name, entry] of Object.entries(file.frames ?? {})) {
    if (entry.frame) frames[name] = { x: entry.frame.x * SHRINK, y: entry.frame.y * SHRINK };
  }
  return { image, cell: CELL * SHRINK, frames, animations: file.animations ?? {}, fps: file.meta?.fps ?? {} };
}
