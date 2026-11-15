import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapState, mapLivePlayers } from '../src/protocol/stateMapper';

test('world tags and UI share match aliases; real names and roles appear only at reveal', () => {
  const player = { displayName: 'Rowan', realName: 'Friend One', isBot: true, x: 1, z: 2 };
  const state = { phase: 'voting', players: new Map([['match-id', player]]) };
  const match = mapState(state);
  assert.equal(match.players[0].name, 'Rowan'); assert.equal(match.players[0].realName, undefined); assert.equal(match.players[0].isBot, undefined);
  assert.equal(mapLivePlayers(state)[0].name, 'Rowan');
  state.phase = 'reveal';
  const reveal = mapState(state);
  assert.equal(reveal.players[0].realName, 'Friend One'); assert.equal(reveal.players[0].isBot, true);
});
