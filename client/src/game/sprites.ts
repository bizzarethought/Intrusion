// Gameplay sprites (public/assets/topdown): the ten robots rendered from the
// same 38-degree angle as the levels. Each sheet is an 8x6 grid of 360 px cells.
//
// A sheet is 25 MB once decoded, so each one is shrunk to two-thirds size and
// uploaded once per look, with its baked ground shadow removed. Warm tinting happens on the GPU.
// Only looks that are on screen get loaded.

const SHRINK = 2 / 3;

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

/**
 * The robot sheets come with a soft ground shadow under each robot. It read as a dark smudge
 * on water, glass and stone, so it is taken out: it is the only translucent black in a sheet.
 */
export function removeShadow(ctx: CanvasRenderingContext2D) {
  const pixels = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const rgba = pixels.data;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 250 && rgba[i] < 40 && rgba[i + 1] < 40 && rgba[i + 2] < 40) rgba[i + 3] = 0;
  }
  ctx.putImageData(pixels, 0, 0);
}

const cache = new Map<string, BotSheet | null>();
const loading = new Set<string>();

/** The sheet for a look if it has loaded, otherwise undefined (and loading starts). */
export function botSheet(look: string): BotSheet | null | undefined {
  if (!cache.has(look) && !loading.has(look)) {
    loading.add(look);
    load(look).catch(() => null).then((sheet) => { cache.set(look, sheet); loading.delete(look); });
  }
  return cache.get(look);
}

async function load(look: string): Promise<BotSheet | null> {
  const [fileResponse, sheetResponse] = await Promise.all([fetch(`/assets/topdown/bot_${look}.json`), fetch(`/assets/topdown/bot_${look}.png`)]);
  if (!fileResponse.ok || !sheetResponse.ok) return null;
  const file = (await fileResponse.json()) as AtlasFile;
  const full = await createImageBitmap(await sheetResponse.blob(), { resizeWidth: 1920, resizeHeight: 1440, resizeQuality: 'high' });
  const image = document.createElement('canvas');
  image.width = full.width;
  image.height = full.height;
  const ctx = image.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(full, 0, 0, image.width, image.height);
  full.close();
  removeShadow(ctx);
  const frames: BotSheet['frames'] = {};
  for (const [name, entry] of Object.entries(file.frames ?? {})) {
    if (entry.frame) frames[name] = { x: entry.frame.x * SHRINK, y: entry.frame.y * SHRINK };
  }
  return { image, cell: CELL * SHRINK, frames, animations: file.animations ?? {}, fps: file.meta?.fps ?? {} };
}

export const loadedSheetCount = () => [...cache.values()].filter(Boolean).length;
