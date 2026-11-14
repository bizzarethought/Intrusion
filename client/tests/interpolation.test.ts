import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PositionBuffer } from '../src/protocol/interpolation';
import type { LivePlayer } from '../src/protocol/types';
const player = (id: string, x: number): LivePlayer => ({ id, name: id, x, z: 0, eliminated: false, finished: false });
test('interpolates remote movement, keeps local position current, and holds on packet gaps', () => {
  const buffer = new PositionBuffer();
  const latest = [player('remote', 0.2), player('self', 0.2)];
  buffer.push([player('remote', 0), player('self', 0)], 'minigame:1', 1000);
  buffer.push(latest, 'minigame:1', 1100);
  const mid = buffer.read(latest, 'self', 1150);
  assert.equal(mid[0].x, 0.1);
  assert.equal(mid[1].x, 0.2);
  assert.equal(buffer.read(latest, 'self', 2000)[0].x, 0.2);
});
test('respawns snap and phase changes discard stale positions', () => {
  const buffer = new PositionBuffer();
  buffer.push([player('remote', 3)], 'minigame:1', 1000);
  buffer.push([player('remote', -3)], 'minigame:1', 1100);
  assert.equal(buffer.read([player('remote', -3)], '', 1150)[0].x, -3);
  buffer.push([player('remote', 0)], 'travel:2', 1200);
  assert.equal(buffer.read([player('remote', 0)], '', 1200)[0].x, 0);
});
