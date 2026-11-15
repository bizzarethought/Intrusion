import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Sprite, Texture, BufferImageSource } from 'pixi.js';
import { setBotScale } from '../src/game/botTransform';

test('a left turn never leaves later right, front or back poses mirrored', () => {
  const texture = new Texture({ source: new BufferImageSource({ resource: new Uint8Array(240 * 240 * 4), width: 240, height: 240 }) });
  const sprite = new Sprite(texture);
  for (const mirrored of [false, true, true, false, true, false, false]) {
    // Reproduce a frame/texture change between turns, as the real renderer does.
    sprite.texture = texture;
    setBotScale(sprite, 180, 240, mirrored);
    assert.equal(sprite.scale.x, mirrored ? -0.75 : 0.75);
    assert.equal(sprite.scale.y, 0.75);
    assert.equal(sprite.width, 180);
    assert.equal(sprite.height, 180);
  }
  sprite.destroy(); texture.destroy(true);
});

test('an unloaded-sheet placeholder cannot carry a mirror into a loaded frame', () => {
  const sprite = new Sprite(Texture.WHITE);
  sprite.scale.set(-30, 50);
  setBotScale(sprite, 240, 240, false);
  assert.equal(sprite.scale.x, 1);
  assert.equal(sprite.scale.y, 1);
  sprite.destroy();
});
