import { useEffect, useState } from 'react';
import { SPRITE_DIR } from './manifest';

// Loads sprite atlases (TexturePacker "JSON Hash") on demand and caches them.
// A sheet is about 3 MB to download and 25 MB once decoded, and the UI never
// shows a sprite bigger than 170 px, so each sheet is shrunk to half size as it
// loads and only the small copy is kept. Only variants on screen are fetched.

const SHRINK = 0.5;

export type Atlas = {
  image: string;
  width: number;
  height: number;
  frames: Record<string, { x: number; y: number; w: number; h: number }>;
  animations: Record<string, string[]>;
  fps: Record<string, number>;
};

type AtlasFile = {
  frames?: Record<string, { frame?: { x: number; y: number; w: number; h: number } }>;
  animations?: Record<string, string[]>;
  meta?: { size?: { w: number; h: number }; fps?: Record<string, number> };
};

const cache = new Map<string, Promise<Atlas | null>>();

/** Resolves to null (never rejects) if the atlas or its image is missing. */
export function loadAtlas(id: string): Promise<Atlas | null> {
  let pending = cache.get(id);
  if (!pending) {
    pending = load(id).catch(() => null);
    cache.set(id, pending);
  }
  return pending;
}

async function load(id: string): Promise<Atlas | null> {
  const response = await fetch(`${SPRITE_DIR}bot_${id}.json`);
  if (!response.ok) return null;
  const file = (await response.json()) as AtlasFile;
  if (!file.frames || !file.meta?.size) return null;
  const sheet = await fetch(`${SPRITE_DIR}bot_${id}.png`);
  if (!sheet.ok) return null;
  const width = Math.round(file.meta.size.w * SHRINK);
  const height = Math.round(file.meta.size.h * SHRINK);
  const small = await createImageBitmap(await sheet.blob(), { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' });
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(small, 0, 0);
  small.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve));
  if (!blob) return null;
  const frames: Atlas['frames'] = {};
  for (const [name, entry] of Object.entries(file.frames)) {
    const f = entry.frame;
    if (f) frames[name] = { x: f.x * SHRINK, y: f.y * SHRINK, w: f.w * SHRINK, h: f.h * SHRINK };
  }
  return { image: URL.createObjectURL(blob), width, height, frames, animations: file.animations ?? {}, fps: file.meta.fps ?? {} };
}

/** undefined while loading, null if missing, otherwise the atlas. */
export function useAtlas(id: string): Atlas | null | undefined {
  const [atlas, setAtlas] = useState<Atlas | null | undefined>(undefined);
  useEffect(() => {
    let current = true;
    setAtlas(undefined);
    loadAtlas(id).then((loaded) => current && setAtlas(loaded));
    return () => { current = false; };
  }, [id]);
  return atlas;
}
