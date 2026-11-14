import { Container, Graphics, Rectangle, Sprite, Texture, TilingSprite } from 'pixi.js';
import type { Level, LevelId } from './levels';
import { insidePolygon, pingPongFrame, rosePose } from './fxMath';

const ROOT = '/assets/fx/';
const MAX_FOLIAGE = 96;
type FxConfig = {
  rose: { frames: number; frame_size: number; centre_px_in_rlgl_bg: [number, number]; draw_scale: number };
  water: { frames: number; frame_size: number; fps: number; pixels_per_meter: number };
  foliage: { files: string[]; frame_size: number; draw_scale_to_match_level: number; anchor: [number, number] };
};
// Inset from the banks: reflections, flowers and rocks in the source image stay intact.
const WATER: Partial<Record<LevelId, number[][]>> = {
  oak: [[1410, 45, 1660, 45, 1680, 80, 1580, 130, 1610, 240, 1720, 260, 1850, 230, 1870, 385, 1770, 435, 1620, 480, 1500, 570, 1370, 620, 1220, 615, 1250, 545, 1290, 505, 1240, 465, 1320, 360, 1370, 260, 1390, 160]],
  rlgl: [[1220, 35, 1390, 35, 1370, 75, 1450, 115, 1500, 110, 1490, 155, 1460, 190, 1490, 225, 1400, 275, 1320, 305, 1270, 380, 1210, 400, 1150, 350, 1090, 300, 1110, 250, 1160, 190, 1180, 115],
    [1200, 1030, 1390, 985, 1580, 985, 1770, 1005, 1890, 1040, 1890, 1080, 1000, 1080]],
};

type Sheet = { image: HTMLCanvasElement; frames: Texture[] };
let configPromise: Promise<FxConfig> | undefined;
let foliagePromise: Promise<Texture[]> | undefined;
let waterPromise: Promise<Sheet> | undefined;
let rosePromise: Promise<Sheet> | undefined;

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
/** Repack long strips into compact atlases below mobile WebGL texture limits. */
async function sheet(name: string, size: number, count: number, columns: number): Promise<Sheet> {
  const bitmap = await imageFile(name);
  if (bitmap.width !== count * size || bitmap.height !== size) {
    bitmap.close(); throw new Error(`Unexpected FX sheet layout: ${name}`);
  }
  const image = document.createElement('canvas');
  image.width = columns * size; image.height = Math.ceil(count / columns) * size;
  const ctx = image.getContext('2d')!;
  for (let i = 0; i < count; i++) ctx.drawImage(bitmap, i * size, 0, size, size, (i % columns) * size, Math.floor(i / columns) * size, size, size);
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

function grassy(level: LevelId, x: number, y: number) {
  if (WATER[level]?.some(polygon => insidePolygon(x, y, polygon))) return false;
  if (level === 'oak') return y > 760 || (x < 330 && y > 130) || (x > 780 && x < 1030 && y > 180 && y < 430);
  if (level === 'rlgl') return (y > 720 && y < 880) || (x > 100 && x < 900 && y > 180 && y < 450);
  return false; // Add placements when the other arenas are enabled.
}

type Plant = { sprite: Sprite; phase: number; strength: number };
export function createFx() {
  const ground = new Container();
  const foreground = new Container();
  ground.eventMode = 'none'; foreground.eventMode = 'none';
  let level: Level | undefined;
  let generation = 0;
  let plants: Plant[] = [];
  let water: TilingSprite[] = [];
  let watcher: Sprite | undefined;
  let settings: FxConfig | undefined;
  let roseFrames: Texture[] = [];
  let waterFrames: Texture[] = [];
  let pose = 0;
  let lastWaterFrame = -1;
  let lastRoseFrame = -1;
  let ready = false;
  let error = '';
  let patchTexture: Texture | undefined;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const stats = { ready: false, level: '', foliage: 0, waterAreas: 0, roseFrame: -1, waterFrame: -1, reducedMotion: false, error: '' };

  function clear() {
    // Containers own sprites and masks; atlas sources are shared and cached for the next round.
    for (const child of ground.removeChildren()) child.destroy({ children: true });
    for (const child of foreground.removeChildren()) child.destroy({ children: true });
    patchTexture?.destroy(true); patchTexture = undefined;
    plants = []; water = []; watcher = undefined; roseFrames = [];
    ready = false; error = ''; lastWaterFrame = -1; lastRoseFrame = -1; pose = 0;
  }

  async function populate(current: Level, token: number) {
    const cfg = await config();
    const [foliage, waterSheet, roseSheet] = await Promise.all([
      foliagePromise ??= foliageAtlas(cfg.foliage),
      waterPromise ??= sheet('water_ripple_sheet.png', cfg.water.frame_size, cfg.water.frames, 4),
      current.id === 'rlgl' ? rosePromise ??= sheet('watcher_rose_sheet.png', cfg.rose.frame_size, cfg.rose.frames, 4) : Promise.resolve(undefined),
    ]);
    if (token !== generation) return; // A slow load must never place an old arena over a new one.
    settings = cfg;
    waterFrames = waterSheet.frames;
    for (const polygon of WATER[current.id] ?? []) {
      const xs = polygon.filter((_, i) => i % 2 === 0), ys = polygon.filter((_, i) => i % 2 === 1);
      const x = Math.min(...xs), y = Math.min(...ys);
      const group = new Container();
      const mask = new Graphics().poly(polygon).fill(0xffffff);
      const surface = new TilingSprite({ texture: waterSheet.frames[0], width: Math.max(...xs) - x, height: Math.max(...ys) - y });
      surface.position.set(x, y); surface.alpha = 0.16;
      const scale = current.pixelsPerMeter / cfg.water.pixels_per_meter;
      surface.tileScale.set(scale, scale);
      group.addChild(surface, mask); surface.mask = mask;
      ground.addChild(group); water.push(surface);
    }
    let seed = [...current.id].reduce((n, char) => n + char.charCodeAt(0), 37);
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const limit = innerWidth < 700 ? 48 : MAX_FOLIAGE;
    for (let attempt = 0; plants.length < limit && attempt < 3000; attempt++) {
      const x = 60 + random() * 1800, y = 140 + random() * 820;
      if (!grassy(current.id, x, y) || plants.some(plant => Math.hypot(plant.sprite.x - x, plant.sprite.y - y) < 65)) continue;
      const sprite = new Sprite(foliage[Math.floor(random() * foliage.length)]);
      const scale = cfg.foliage.draw_scale_to_match_level * (0.75 + random() * 0.4);
      sprite.anchor.set(...cfg.foliage.anchor); sprite.position.set(x, y); sprite.scale.set(scale); sprite.tint = 0xdecfb5;
      ground.addChild(sprite); plants.push({ sprite, phase: random() * Math.PI * 2, strength: 0.015 + random() * 0.02 });
    }
    plants.sort((a, b) => a.sprite.y - b.sprite.y);
    for (const plant of plants) ground.setChildIndex(plant.sprite, ground.children.length - 1);

    if (roseSheet) {
      roseFrames = roseSheet.frames;
      const size = cfg.rose.frame_size, [cx, cy] = cfg.rose.centre_px_in_rlgl_bg;
      // The exported background has the open head baked in. A one-time ground patch,
      // clipped by that head's alpha, keeps it from showing through closed petals.
      const patch = document.createElement('canvas'); patch.width = size; patch.height = size;
      const ctx = patch.getContext('2d')!;
      ctx.drawImage(current.image, 700, 350, size, size, 0, 0, size, size);
      ctx.globalCompositeOperation = 'destination-in';
      const frame = roseFrames[roseFrames.length - 1].frame;
      ctx.drawImage(roseSheet.image, frame.x, frame.y, size, size, 0, 0, size, size);
      patchTexture = Texture.from(patch);
      const cover = new Sprite(patchTexture); cover.anchor.set(0.5); cover.position.set(cx, cy); cover.scale.set(cfg.rose.draw_scale);
      ground.addChild(cover);
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
        const budget = innerWidth < 700 ? 48 : MAX_FOLIAGE;
        for (let i = 0; i < plants.length; i++) {
          const plant = plants[i];
          const visible = i < budget && plant.sprite.x > -100 && plant.sprite.x < 2020 && plant.sprite.y > -100 && plant.sprite.y < 1180;
          plant.sprite.visible = visible;
          if (visible) plant.sprite.skew.x = quiet ? 0 : Math.sin(time * 1.35 + plant.phase) * plant.strength;
        }
        if (watcher) {
          pose = rosePose(pose, phase === 'minigame' && signal === 'green', dt, quiet);
          const frame = Math.round(pose * (roseFrames.length - 1));
          if (frame !== lastRoseFrame) { watcher.texture = roseFrames[frame]; lastRoseFrame = frame; }
        }
      }
      Object.assign(stats, { ready, level: current.id, foliage: plants.length, waterAreas: water.length, roseFrame: lastRoseFrame, waterFrame: lastWaterFrame, reducedMotion: quiet, error });
    },
  };
}
