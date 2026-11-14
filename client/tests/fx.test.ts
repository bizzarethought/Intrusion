import assert from 'node:assert/strict';
import { test } from 'node:test';
import { insidePolygon, pingPongFrame, rosePose } from '../src/game/fxMath';

test('water ping-pongs without an endpoint pause and stays in bounds', () => {
  assert.deepEqual(Array.from({ length: 9 }, (_, i) => pingPongFrame(i, 1, 3)), [0, 1, 2, 1, 0, 1, 2, 1, 0]);
  for (let i = 0; i < 1000; i++) assert.ok(pingPongFrame(i / 10, 10, 12) >= 0 && pingPongFrame(i / 10, 10, 12) < 12);
  assert.equal(pingPongFrame(10, 10, 1), 0);
});
test('rose closes within reaction grace and reverses from its current pose', () => {
  assert.equal(rosePose(1, false, 0.3, false), 0);
  assert.equal(rosePose(0, true, 0.3, false), 1);
  const partial = rosePose(0, true, 0.1, false);
  assert.ok(partial > 0 && partial < 1);
  assert.equal(rosePose(partial, false, 0.1, false), 0);
  assert.equal(rosePose(0.2, true, 0, true), 1);
  assert.equal(rosePose(0.8, false, 0, true), 0);
});
test('water masks contain ponds but exclude adjacent ground', () => {
  const pond = [100, 100, 200, 100, 200, 200, 100, 200];
  assert.equal(insidePolygon(150, 150, pond), true);
  assert.equal(insidePolygon(90, 150, pond), false);
  assert.equal(insidePolygon(150, 210, pond), false);
});
