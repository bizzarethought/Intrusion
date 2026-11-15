import type { Sprite } from 'pixi.js';

/** Assign both signed axes explicitly; Sprite.width preserves an existing mirror. */
export function setBotScale(sprite: Sprite, size: number, cell: number, mirrored: boolean) {
  const scale = size / cell;
  sprite.scale.set(mirrored ? -scale : scale, scale);
}
