import { Container, Rectangle, Sprite, Texture, TilingSprite } from 'pixi.js';
import { COLLISION_HEIGHT as ROWS, COLLISION_WIDTH as COLUMNS, type Level } from './levels';
import { pingPongFrame, rosePose, idleRoseFrame } from './fxMath';

const ROOT = '/assets/fx/';
const MAX_FOLIAGE = 96;
type FxConfig = {
  rose: { frames: number; frame_size: number; centre_px_in_rlgl_bg: [number, number]; draw_scale: number };
  water: { frames: number; frame_size: number; fps: number; pixels_per_meter: number };
  foliage: { files: string[]; frame_size: number; draw_scale_to_match_level: number; anchor: [number, number] };
};

/**
 * Reads the level's own picture, one sample per cell of its collision map, to find
 * the water (blue, and nowhere to stand) and the open grass (green, and somewhere to stand).
 * The water comes back as a soft-edged mask too, so the moving surface meets the banks
 * exactly, with no outline of its own.
 */
function survey(level: Level) {
  const size = COLUMNS * ROWS;
  const wet = new Uint8Array(size), green = new Uint8Array(size);
  const hard = document.createElement('canvas'); hard.width = COLUMNS; hard.height = ROWS;
  const ctx = hard.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(level.image, 0, 0, COLUMNS, ROWS);
  const pixels = ctx.getImageData(0, 0, COLUMNS, ROWS);
  const box = { left: COLUMNS, top: ROWS, right: 0, bottom: 0 };
  for (let i = 0; i < size; i++) {
    const r = pixels.data[i * 4], g = pixels.data[i * 4 + 1], b = pixels.data[i * 4 + 2];
    const ground = level.collision?.[i] === 1;
    wet[i] = Number(level.collision !== null && !ground && b > r + 25 && g > r + 10);
    green[i] = Number(ground && g > r && g > b + 10);
    pixels.data.fill(255, i * 4, i * 4 + 3); pixels.data[i * 4 + 3] = wet[i] * 255;
    if (wet[i]) {
      const x = i % COLUMNS, y = Math.floor(i / COLUMNS);
      box.left = Math.min(box.left, x); box.right = Math.max(box.right, x + 1);
      box.top = Math.min(box.top, y); box.bottom = Math.max(box.bottom, y + 1);
    }
  }
  ctx.putImageData(pixels, 0, 0);
  const mask = document.createElement('canvas'); mask.width = COLUMNS; mask.height = ROWS;
  const soft = mask.getContext('2d')!;
  soft.filter = 'blur(1.5px)'; // where a browser has no canvas filter the edge is just crisper
  soft.drawImage(hard, 0, 0);
  /** True where every one of the points (level pixels) lands on a marked cell. */
  const all = (cells: Uint8Array, points: number[][]) => points.every(([x, y]) =>
    x >= 0 && y >= 0 && x < COLUMNS * 4 && y < ROWS * 4 && cells[Math.floor(y / 4) * COLUMNS + Math.floor(x / 4)] === 1);
  return { wet, green, mask, box, all };
}

type Sheet = { image: HTMLCanvasElement; frames: Texture[] };
let configPromise: Promise<FxConfig> | undefined;
let foliagePromise: Promise<Texture[]> | undefined;
let waterPromise: Promise<Sheet> | undefined;
let rosePromise: Promise<Sheet> | undefined;
const roseAnchors = new WeakMap<Sheet, Array<[number, number]>>();
/** Keep the base of the petals planted in one spot as the head changes shape. */
function petalAnchors(sheet: Sheet): Array<[number, number]> {
  const cached = roseAnchors.get(sheet);
  if (cached) return cached;
  const image = document.createElement('canvas'); image.width = image.height = 64;
  const ctx = image.getContext('2d', { willReadFrequently: true })!;
  const anchors = sheet.frames.map(texture => {
    const f = texture.frame;
    ctx.clearRect(0, 0, 64, 64); ctx.drawImage(sheet.image, f.x, f.y, f.width, f.height, 0, 0, 64, 64);
    const pixels = ctx.getImageData(0, 0, 64, 64).data;
    let left = 64, right = 0, bottom = 0;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      if (pixels[(y * 64 + x) * 4 + 3] > 64) { left = Math.min(left, x); right = Math.max(right, x); bottom = Math.max(bottom, y); }
    }
    return [(left + right + 1) / 128, (bottom + 1) / 64] as [number, number];
  });
  roseAnchors.set(sheet, anchors); return anchors;
}
let pollenTexture: Texture | undefined;
let rippleTexture: Texture | undefined;
function rippleRing() {
  if (rippleTexture) return rippleTexture;
  const image = document.createElement('canvas'); image.width = 128; image.height = 64;
  const ctx = image.getContext('2d')!;
  ctx.strokeStyle = 'rgba(208,240,238,0.85)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(64, 32, 60, 26, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(208,240,238,0.3)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(64, 32, 48, 20, 0, 0, Math.PI * 2); ctx.stroke();
  return rippleTexture = Texture.from(image);
}
function pollenDot() {
  if (pollenTexture) return pollenTexture;
  const image = document.createElement('canvas'); image.width = image.height = 24;
  const ctx = image.getContext('2d')!;
  const glow = ctx.createRadialGradient(12, 12, 0, 12, 12, 12);
  glow.addColorStop(0, 'rgba(255,246,191,1)');
  glow.addColorStop(0.25, 'rgba(255,231,148,0.8)');
  glow.addColorStop(1, 'rgba(255,231,148,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, 24, 24);
  return pollenTexture = Texture.from(image);
}

async function imageFile(name: string) {
  const response = await fetch(ROOT + name);
  if (!response.ok) throw new Error(`FX asset unavailable: ${name}`);
  return createImageBitmap(await response.blob());
}
function config() {
  return configPromise ??= fetch(ROOT + 'fx.json').then(response => {
    if (!response.ok) throw new Error('FX configuration unavailable');
    return response.json() as Promise<FxConfig>;
  });
}
/**
 * Repack long strips into compact atlases below mobile WebGL texture limits.
 * `mirrored` packs each frame as a 2x2 block of itself flipped, at half size, so the
 * frame can repeat across a pond with no visible seam (the water loop is not tileable).
 */
async function sheet(name: string, size: number, count: number, columns: number, mirrored = false): Promise<Sheet> {
  const bitmap = await imageFile(name);
  if (bitmap.width !== count * size || bitmap.height !== size) {
    bitmap.close(); throw new Error(`Unexpected FX sheet layout: ${name}`);
  }
  const image = document.createElement('canvas');
  image.width = columns * size; image.height = Math.ceil(count / columns) * size;
  const ctx = image.getContext('2d')!;
  for (let i = 0; i < count; i++) {
    const x = (i % columns) * size, y = Math.floor(i / columns) * size;
    if (!mirrored) { ctx.drawImage(bitmap, i * size, 0, size, size, x, y, size, size); continue; }
    for (const [flipX, flipY] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      ctx.setTransform(flipX ? -1 : 1, 0, 0, flipY ? -1 : 1, x + flipX * size, y + flipY * size);
      ctx.drawImage(bitmap, i * size, 0, size, size, 0, 0, size / 2, size / 2);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  bitmap.close();
  const source = Texture.from(image).source;
  return { image, frames: Array.from({ length: count }, (_, i) => new Texture({ source, frame: new Rectangle((i % columns) * size, Math.floor(i / columns) * size, size, size) })) };
}
async function foliageAtlas(settings: FxConfig['foliage']) {
  const images = await Promise.all(settings.files.map(imageFile));
  const canvas = document.createElement('canvas');
  const size = settings.frame_size;
  canvas.width = size * 2; canvas.height = size * 2;
  const ctx = canvas.getContext('2d')!;
  images.forEach((image, i) => { ctx.drawImage(image, (i % 2) * size, Math.floor(i / 2) * size); image.close(); });
  const source = Texture.from(canvas).source;
  return images.map((_, i) => new Texture({ source, frame: new Rectangle((i % 2) * size, Math.floor(i / 2) * size, size, size) }));
}

/** Where a tuft may be planted: open grass with grass around it, away from where the art is already busy. */
function grassy(level: Level, land: ReturnType<typeof survey>, x: number, y: number) {
  if (!land.all(land.green, [[x, y], [x - 36, y], [x + 36, y], [x, y - 20], [x, y + 20]])) return false;
  if (level.id === 'oak') return y > 760 || (x < 330 && y > 130) || (x > 780 && x < 1030 && y > 180 && y < 430);
  if (level.id === 'rlgl') return !(x > 100 && x < 1560 && y > 440 && y < 840); // keep the course clear
  if (level.id === 'side') return false; // the middle platform is where everyone stands
  return true;
}

type Plant = { sprite: Sprite; phase: number; strength: number };
type Ripple = { sprite: Sprite; phase: number };
type Pollen = { sprite: Sprite; x: number; y: number; phase: number; speed: number };
export function createFx() {
  const ground = new Container();
  const foreground = new Container();
  ground.eventMode = 'none'; foreground.eventMode = 'none';
  let level: Level | undefined;
  let generation = 0;
  let plants: Plant[] = [];
  let pollen: Pollen[] = [];
  let water: TilingSprite[] = [];
  let ripples: Ripple[] = [];
  let watcher: Sprite | undefined;
  let oakRose: Sprite | undefined;
  let oakAnchors: Array<[number, number]> = [];
  let staticRoseCount = 0;
  let oakCoverTexture: Texture | undefined;
  let settings: FxConfig | undefined;
  let roseFrames: Texture[] = [];
  let waterFrames: Texture[] = [];
  let pose = 0;
  let lastWaterFrame = -1;
  let lastRoseFrame = -1;
  let ready = false;
  let error = '';
  let maskTexture: Texture | undefined;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const stats = { ready: false, level: '', foliage: 0, waterAreas: 0, roseFrame: -1, waterFrame: -1, oakRoseScale: 1, staticRoses: 0, reducedMotion: false, pollen: 0, ripples: 0, wind: 0, waterOffset: 0, error: '' };

  function clear() {
    // Containers own sprites and masks; atlas sources are shared and cached for the next round.
    for (const child of ground.removeChildren()) child.destroy({ children: true });
    for (const child of foreground.removeChildren()) child.destroy({ children: true });
    maskTexture?.destroy(true); maskTexture = undefined;
    oakCoverTexture?.destroy(true); oakCoverTexture = undefined;
    oakRose = undefined; oakAnchors = []; staticRoseCount = 0;
    plants = []; pollen = []; water = []; ripples = []; watcher = undefined; roseFrames = [];
    ready = false; error = ''; lastWaterFrame = -1; lastRoseFrame = -1; pose = 0;
  }

  async function populate(current: Level, token: number) {
    const cfg = await config();
    const [foliage, waterSheet, roseSheet] = await Promise.all([
      foliagePromise ??= foliageAtlas(cfg.foliage),
      waterPromise ??= sheet('water_ripple_sheet.png', cfg.water.frame_size, cfg.water.frames, 4, true),
      (current.id === 'rlgl' || current.id === 'oak') ? rosePromise ??= sheet('watcher_rose_sheet.png', cfg.rose.frame_size, cfg.rose.frames, 4) : Promise.resolve(undefined),
    ]);
    if (token !== generation) return; // A slow load must never place an old arena over a new one.
    settings = cfg;
    waterFrames = waterSheet.frames;
    const land = survey(current);
    if (land.box.right > land.box.left) {
      // The water loop moves over every pond in the picture, cut to the water's own outline.
      const x = land.box.left * 4, y = land.box.top * 4;
      const group = new Container();
      const surface = new TilingSprite({ texture: waterSheet.frames[0], width: land.box.right * 4 - x, height: land.box.bottom * 4 - y });
      surface.position.set(x, y); surface.alpha = 0.28;
      const scale = (current.pixelsPerMeter / cfg.water.pixels_per_meter) * 2; // each tile holds the frame twice across, at half size
      surface.tileScale.set(scale, scale);
      maskTexture = Texture.from(land.mask);
      const outline = new Sprite(maskTexture); outline.width = COLUMNS * 4; outline.height = ROWS * 4;
      group.addChild(surface, outline); surface.mask = outline;
      ground.addChild(group); water.push(surface);
      // A handful of expanding rings makes the broad, low-contrast water animation legible.
      let placed = 0;
      for (let attempt = 0; placed < 6 && attempt < 400; attempt++) {
        const rx = x + ((attempt * 0.618033 + 0.2) % 1) * surface.width;
        const ry = y + ((attempt * 0.414214 + 0.35) % 1) * surface.height;
        if (!land.all(land.wet, [[-65, 0], [65, 0], [0, -32], [0, 32], [-45, -23], [45, 23]].map(([dx, dy]) => [rx + dx, ry + dy]))) continue;
        const sprite = new Sprite(rippleRing()); sprite.anchor.set(0.5); sprite.position.set(rx, ry);
        group.addChild(sprite); ripples.push({ sprite, phase: placed / 6 }); placed++;
      }
    }
    let seed = [...current.id].reduce((n, char) => n + char.charCodeAt(0), 37);
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const limit = innerWidth < 700 ? 48 : MAX_FOLIAGE;
    for (let attempt = 0; plants.length < limit && attempt < 3000; attempt++) {
      const x = 60 + random() * 1800, y = 140 + random() * 820;
      if (!grassy(current, land, x, y) || plants.some(plant => Math.hypot(plant.sprite.x - x, plant.sprite.y - y) < 65)) continue;
      const sprite = new Sprite(foliage[Math.floor(random() * foliage.length)]);
      const scale = cfg.foliage.draw_scale_to_match_level * (0.75 + random() * 0.4);
      sprite.anchor.set(...cfg.foliage.anchor); sprite.position.set(x, y); sprite.scale.set(scale); sprite.tint = 0xdecfb5;
      ground.addChild(sprite); plants.push({ sprite, phase: random() * Math.PI * 2, strength: 0.16 + random() * 0.1 });
    }
    plants.sort((a, b) => a.sprite.y - b.sprite.y);
    for (const plant of plants) ground.setChildIndex(plant.sprite, ground.children.length - 1);

    if (current.id === 'oak' || current.id === 'rlgl') {
      const count = innerWidth < 700 ? 12 : 24;
      for (let i = 0; i < count; i++) {
        const sprite = new Sprite(pollenDot());
        sprite.anchor.set(0.5); sprite.width = sprite.height = 8 + random() * 9;
        const particle = { sprite, x: random() * 1920, y: 100 + random() * 900, phase: random() * Math.PI * 2, speed: 7 + random() * 10 };
        ground.addChild(sprite); pollen.push(particle);
      }
    }

    if (current.id === 'oak' && roseSheet) {
      roseFrames = roseSheet.frames;
      // Use the baked flower only to build a stationary cover. Animated pixels come
      // exclusively from the transparent FX sheet, so grass can never move with the rose.
      const x = 742, y = 516, width = 216, height = 162;
      const flower = document.createElement('canvas'); flower.width = width; flower.height = height;
      const ctx = flower.getContext('2d')!;
      ctx.drawImage(current.image, x, y, width, height, 0, 0, width, height);
      const pixels = ctx.getImageData(0, 0, width, height);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const r = pixels.data[i], g = pixels.data[i + 1], b = pixels.data[i + 2];
        pixels.data[i + 3] = Math.round(255 * Math.max(0, Math.min(1, (r - Math.max(g, b) - 2) / 8)));
      }
      // Pale petal highlights belong to the flower too: fill enclosed gaps in the color mask.
      const outside = new Uint8Array(width * height);
      const queue = new Int32Array(width * height);
      let head = 0, tail = 0;
      const visit = (index: number) => {
        if (!outside[index] && pixels.data[index * 4 + 3] < 128) { outside[index] = 1; queue[tail++] = index; }
      };
      for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
      for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
      while (head < tail) {
        const index = queue[head++], px = index % width, py = Math.floor(index / width);
        if (px > 0) visit(index - 1);
        if (px < width - 1) visit(index + 1);
        if (py > 0) visit(index - width);
        if (py < height - 1) visit(index + width);
      }
      for (let i = 0; i < outside.length; i++) if (!outside[i]) pixels.data[i * 4 + 3] = 255;
      ctx.putImageData(pixels, 0, 0);
      const coverImage = document.createElement('canvas'); coverImage.width = width; coverImage.height = height;
      const coverCtx = coverImage.getContext('2d')!;
      coverCtx.drawImage(current.image, 630, 320, width, height, 0, 0, width, height);
      coverCtx.globalCompositeOperation = 'destination-in'; coverCtx.drawImage(flower, 0, 0);
      oakCoverTexture = Texture.from(coverImage);
      const cover = new Sprite(oakCoverTexture); cover.position.set(x, y); ground.addChild(cover);
      oakAnchors = petalAnchors(roseSheet);
      const openFrame = roseFrames.length - 1;
      const plantRose = (x: number, y: number, scale: number) => {
        // A leafy base and a petal-bottom anchor keep the flower rooted in the meadow.
        const leaves = new Sprite(foliage[1]); leaves.anchor.set(...cfg.foliage.anchor);
        leaves.position.set(x, y + 8); leaves.scale.set(scale * 1.5); leaves.tint = 0xc5c99b;
        const rose = new Sprite(roseFrames[openFrame]); rose.anchor.set(...oakAnchors[openFrame]);
        rose.position.set(x, y); rose.scale.set(scale);
        ground.addChild(leaves, rose);
        return rose;
      };
      // Keep one by the bank; scatter a smaller companion beside the far meadow.
      plantRose(850, 660, 0.34);
      plantRose(1410, 870, 0.25);
      staticRoseCount = 2;
      // The animated flower has open grass around it and uses the sheet's natural proportions.
      oakRose = plantRose(1060, 920, 0.32);
    }

    if (current.id === 'rlgl' && roseSheet) {
      roseFrames = roseSheet.frames;
      // The level's own file says where the watching rose stands; the picture no longer has one baked in.
      const [cx, cy] = current.watcher ? [current.watcher.x, current.watcher.y] : cfg.rose.centre_px_in_rlgl_bg;
      watcher = new Sprite(roseFrames[0]); watcher.anchor.set(0.5); watcher.position.set(cx, cy); watcher.scale.set(cfg.rose.draw_scale);
      foreground.addChild(watcher);
    }
    ready = true;
  }

  return {
    ground, foreground, stats,
    update(current: Level, dt: number, time: number, signal: 'green' | 'red' | null, phase: string) {
      if (current !== level) {
        level = current; clear();
        const token = ++generation;
        void populate(current, token).catch(reason => {
          if (token !== generation) return;
          error = reason instanceof Error ? reason.message : String(reason);
          console.warn('Scenery FX unavailable; keeping the base level.', reason);
        });
      }
      const quiet = reducedMotion.matches;
      if (ready && settings) {
        const waterFrame = quiet ? 0 : pingPongFrame(time, settings.water.fps, settings.water.frames);
        if (waterFrame !== lastWaterFrame) {
          // Frame textures share one GPU source; no decoding or uploads during playback.
          for (const surface of water) surface.texture = waterFrames[waterFrame];
          lastWaterFrame = waterFrame;
        }
        // A gentle current remains visible between the sheet's 10 FPS frames.
        for (const surface of water) {
          surface.tilePosition.set(quiet ? 0 : time * 8, quiet ? 0 : Math.sin(time * 0.45) * 8);
        }
        for (const ripple of ripples) {
          ripple.sprite.visible = !quiet;
          if (!quiet) {
            const progress = (time * 0.24 + ripple.phase) % 1;
            ripple.sprite.scale.set(0.25 + progress * 0.75);
            ripple.sprite.alpha = Math.sin(progress * Math.PI) * 0.48;
          }
        }
        const breeze = Math.sin(time * 1.1);
        const budget = innerWidth < 700 ? 48 : MAX_FOLIAGE;
        for (let i = 0; i < plants.length; i++) {
          const plant = plants[i];
          const visible = i < budget && plant.sprite.x > -100 && plant.sprite.x < 2020 && plant.sprite.y > -100 && plant.sprite.y < 1180;
          plant.sprite.visible = visible;
          if (visible) {
            const bend = quiet ? 0 : (breeze * 0.55 + Math.sin(time * 1.6 + plant.phase) * 0.45) * plant.strength;
            plant.sprite.skew.x = bend;
            plant.sprite.rotation = bend * 0.16;
          }
        }
        const pollenBudget = innerWidth < 700 ? 12 : 24;
        for (let i = 0; i < pollen.length; i++) {
          const particle = pollen[i];
          particle.sprite.visible = !quiet && i < pollenBudget;
          if (!particle.sprite.visible) continue;
          // Wrap softly at the edges; positions are absolute-time based and frame-rate independent.
          const drift = particle.x + time * particle.speed;
          particle.sprite.position.set((drift % 2040) - 60, particle.y + Math.sin(time * 0.65 + particle.phase) * 22);
          particle.sprite.alpha = (0.25 + (Math.sin(time * 0.8 + particle.phase) + 1) * 0.16);
        }
        if (oakRose) {
          const frame = quiet ? roseFrames.length - 1 : idleRoseFrame(time, roseFrames.length);
          if (frame !== lastRoseFrame) {
            oakRose.texture = roseFrames[frame]; oakRose.anchor.set(...oakAnchors[frame]); lastRoseFrame = frame;
          }
        }
        if (watcher) {
          pose = rosePose(pose, phase === 'minigame' && signal === 'green', dt, quiet);
          const frame = Math.round(pose * (roseFrames.length - 1));
          if (frame !== lastRoseFrame) { watcher.texture = roseFrames[frame]; lastRoseFrame = frame; }
        }
      }
      Object.assign(stats, { ready, level: current.id, foliage: plants.length, waterAreas: water.length, roseFrame: lastRoseFrame, waterFrame: lastWaterFrame, reducedMotion: quiet, oakRoseScale: oakRose?.scale.x ?? 1, staticRoses: staticRoseCount,
        ripples: quiet ? 0 : ripples.length,
        pollen: quiet ? 0 : Math.min(pollen.length, innerWidth < 700 ? 12 : 24),
        wind: plants[0]?.sprite.skew.x ?? 0, waterOffset: water[0]?.tilePosition.x ?? 0, error });
    },
  };
}
