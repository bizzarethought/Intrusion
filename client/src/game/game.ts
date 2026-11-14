import { variantFor } from '../assets/looks';
import { VARIANTS, variant } from '../assets/manifest';
import { play } from '../audio';
import { live, onCaught, send } from '../protocol/roomClient';
import { clearWorldHud, setWorldHud } from '../scene/worldHud';
import { DEPTH_SQUASH, LEVEL_FOR_GAME, LEVEL_HEIGHT, LEVEL_WIDTH, RLGL, loadLevel, toMeters, toPixels, walkable, type Level, type LevelId, type Spot } from './levels';
import { ANCHOR, BODY_HEIGHT, CELL, botSheet } from './sprites';

// The game view: a 2D canvas that draws a pre-rendered level, then the robots
// on top, nearest last, so they look like they are standing in the scene.
//   attract - the oak level with a few demo robots (landing and join screens)
//   lobby   - the oak level with the players gathered round
//   play    - the current mini-game's level, with the local player in control;
//             back to the oak for the Turing check, vote and scoreboard
export type GameScene = 'attract' | 'lobby' | 'play';

const WALK_SPEED = 1.5; // metres per second
const SEND_EVERY = 1 / 15; // seconds between movement messages to the server
const MOSS = '#10190f'; // letterbox colour around the level

type Bot = {
  look: string;
  name: string;
  x: number;
  y: number;
  facing: 'side' | 'front' | 'back';
  flip: boolean; // side frames face right; flip them to face left
  moving: boolean;
  eliminated: boolean;
  isSelf: boolean;
  placed: boolean;
  emote: string;
  emoteUntil: number;
  offset: number; // so robots don't animate in unison
};

export function createGame(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  let scene: GameScene = 'attract';
  let time = 0;
  let last = performance.now();

  // Levels load the first time they are needed.
  const levels = new Map<LevelId, Level>();
  const requested = new Set<LevelId>();
  function getLevel(id: LevelId) {
    if (!requested.has(id)) {
      requested.add(id);
      loadLevel(id).then((level) => levels.set(id, level)).catch(() => requested.delete(id));
    }
    return levels.get(id);
  }

  // The level is scaled to fit the window, centred, with moss-coloured bars if the shape differs.
  const view = { scale: 1, left: 0, top: 0 };
  function resize() {
    const ratio = Math.min(devicePixelRatio, 2);
    canvas.width = Math.round(innerWidth * ratio);
    canvas.height = Math.round(innerHeight * ratio);
    view.scale = Math.min(innerWidth / LEVEL_WIDTH, innerHeight / LEVEL_HEIGHT);
    view.left = (innerWidth - LEVEL_WIDTH * view.scale) / 2;
    view.top = (innerHeight - LEVEL_HEIGHT * view.scale) / 2;
  }
  addEventListener('resize', resize);
  resize();

  // --- input: WASD / arrows, or click / tap the grass to walk there ---
  const keys = new Set<string>();
  let walkTarget: Spot | null = null;
  let canWalk = false;
  const typing = (event: Event) => event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
  addEventListener('keydown', (event) => { if (!typing(event)) keys.add(event.code); });
  addEventListener('keyup', (event) => keys.delete(event.code));
  addEventListener('blur', () => keys.clear());
  canvas.addEventListener('pointerdown', (event) => {
    if (canWalk) walkTarget = { x: (event.clientX - view.left) / view.scale, y: (event.clientY - view.top) / view.scale };
  });

  const bots = new Map<string, Bot>();
  const local: Spot = { x: 0, y: 0 }; // the local player's own position; the server follows it
  let levelKey = '';
  let sendTimer = 0;
  const lastSent: Spot = { x: Infinity, y: 0 };
  let result = '';
  let resultUntil = 0;
  let lastSignal: 'green' | 'red' | null = null;
  let sawFinish = false;
  let wasCaught = false;
  onCaught(() => { wasCaught = true; });

  /** Moves the local player. The server decides the light, who is caught and who has finished. */
  function stepSelf(dt: number, state: ReturnType<typeof live>, level: Level, bot: Bot, me: { x: number; z: number; finished: boolean }) {
    const playing = state.phase === 'minigame';
    canWalk = playing && !bot.eliminated;
    const server = toPixels(level, me.x, me.z);
    if (wasCaught) {
      // The rose saw us move: the server has put us back behind the start line.
      wasCaught = false;
      Object.assign(local, server);
      walkTarget = null;
      result = 'The rose saw you move. Back to the start.';
      resultUntil = time + 3;
      bot.emote = 'emote_angry';
      bot.emoteUntil = time + 1.5;
      play('caught');
    } else if (Math.hypot(local.x - server.x, local.y - server.y) > level.pixelsPerMeter) {
      Object.assign(local, server); // we drifted from where the server has us (it limits speed and edges)
    }
    if (me.finished && !sawFinish) {
      result = 'Across the line!';
      resultUntil = time + 4;
      bot.emote = 'emote_happy';
      bot.emoteUntil = time + 2.5;
      play('score');
    }
    sawFinish = me.finished;

    let dx = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
    let dy = Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp'));
    if (dx || dy) walkTarget = null;
    else if (walkTarget) {
      dx = walkTarget.x - local.x;
      dy = (walkTarget.y - local.y) / DEPTH_SQUASH;
      if (Math.hypot(dx, dy) < 6) { walkTarget = null; dx = dy = 0; }
    }
    const length = Math.hypot(dx, dy);
    if (canWalk && length > 0) {
      const stride = WALK_SPEED * level.pixelsPerMeter * dt;
      const x = local.x + (dx / length) * stride;
      const y = local.y + (dy / length) * stride * DEPTH_SQUASH;
      // Slide along an edge instead of stopping dead at it.
      if (walkable(level.id, x, y)) { local.x = x; local.y = y; }
      else if (walkable(level.id, x, local.y)) local.x = x;
      else if (walkable(level.id, local.x, y)) local.y = y;
      else walkTarget = null;
    }

    if (state.signal && state.signal !== lastSignal) play(state.signal === 'green' ? 'go' : 'stop');
    lastSignal = state.signal;
    let objective = '';
    if (bot.eliminated) objective = 'You were voted out. You can still watch.';
    else if (!playing) objective = 'Get ready. Run when the rose opens.';
    else if (me.finished) objective = 'You made it. Watch who else does, and how.';
    else if (local.x <= RLGL.startX) objective = 'Cross the roses and run for the far side.';
    else objective = state.signal === 'red' ? 'Freeze! The rose is watching.' : 'Go! The rose is open.';

    // Tell the server, but not on every frame.
    sendTimer += dt;
    if (canWalk && sendTimer >= SEND_EVERY && (lastSent.x !== local.x || lastSent.y !== local.y)) {
      const metres = toMeters(level, local);
      send.move(metres.x, metres.z);
      lastSent.x = local.x;
      lastSent.y = local.y;
      sendTimer = 0;
    }
    if (time > resultUntil) result = '';
    setWorldHud({ objective, distance: 0, bearing: null, signal: playing ? state.signal : null, result, scored: me.finished });
  }

  function drawBot(bot: Bot, level: Level) {
    const size = (CELL * level.botHeight) / BODY_HEIGHT; // one sprite cell, in level pixels
    // A soft dark blob so the robot sits on the grass (the baked shadow is faint on dark ground).
    ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
    ctx.beginPath();
    ctx.ellipse(bot.x, bot.y, size * 0.21, size * 0.075, 0, 0, Math.PI * 2);
    ctx.fill();

    const sheet = botSheet(bot.look);
    if (!sheet) {
      // Still loading (or missing): a plain disc in the look's colour.
      ctx.fillStyle = variant(bot.look).uiColor;
      ctx.beginPath();
      ctx.arc(bot.x, bot.y - size * 0.3, size * 0.2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const clock = time + bot.offset;
    const emoting = time < bot.emoteUntil;
    let animation = `${bot.moving ? 'walk' : 'idle'}_${bot.facing}`;
    if (bot.eliminated) animation = 'deactivated';
    else if (emoting) animation = bot.emote;
    else if (!bot.moving && clock % 4 < 0.15 && bot.facing !== 'back') animation = bot.facing === 'side' ? 'blink_side' : 'emote_blink';
    const frames = sheet.animations[animation] ?? [animation];
    const frame = sheet.frames[frames[Math.floor(clock * (sheet.fps[animation] ?? 6)) % frames.length]] ?? sheet.frames.idle_front_0;
    if (!frame) return;
    const hop = bot.moving ? Math.abs(Math.sin(clock * 10)) * size * 0.02 : 0;
    ctx.save();
    ctx.translate(bot.x, bot.y - hop);
    if (bot.flip && bot.facing === 'side' && !bot.eliminated && !emoting) ctx.scale(-1, 1);
    ctx.drawImage(sheet.image, frame.x, frame.y, sheet.cell, sheet.cell, -size * ANCHOR.x, -size * ANCHOR.y, size, size);
    ctx.restore();
  }

  function drawNameTag(bot: Bot, level: Level) {
    if (!bot.name) return;
    const size = (CELL * level.botHeight) / BODY_HEIGHT;
    const text = bot.isSelf ? `${bot.name} (you)` : bot.name;
    ctx.font = '600 24px system-ui, sans-serif';
    const width = ctx.measureText(text).width + 26;
    const y = bot.y - size * 0.84;
    const x = Math.min(LEVEL_WIDTH - width / 2 - 8, Math.max(width / 2 + 8, bot.x)); // keep the tag on the picture
    ctx.fillStyle = bot.isSelf ? '#2a93c6' : 'rgba(16, 25, 15, 0.8)';
    ctx.beginPath();
    ctx.roundRect(x - width / 2, y - 19, width, 36, 18);
    ctx.fill();
    ctx.fillStyle = '#f3ecd8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  }

  /** The watching rose's glow, and the line to reach. */
  function drawRlgl(green: boolean) {
    const { x, y, radius } = RLGL.watcher;
    const pulse = 0.75 + Math.sin(time * (green ? 2 : 9)) * 0.25;
    const glow = ctx.createRadialGradient(x, y, radius * 0.3, x, y, radius * 1.5);
    glow.addColorStop(0, green ? `rgba(120, 255, 140, ${0.3 * pulse})` : `rgba(255, 20, 40, ${0.6 * pulse})`);
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - radius * 1.5, y - radius * 1.5, radius * 3, radius * 3);
    // A faint shimmer along the finish.
    const line = ctx.createLinearGradient(RLGL.finishX - 30, 0, RLGL.finishX + 30, 0);
    line.addColorStop(0, 'rgba(242, 194, 48, 0)');
    line.addColorStop(0.5, `rgba(242, 194, 48, ${0.28 + Math.sin(time * 3) * 0.08})`);
    line.addColorStop(1, 'rgba(242, 194, 48, 0)');
    ctx.fillStyle = line;
    ctx.fillRect(RLGL.finishX - 30, RLGL.laneTop - 90, 60, RLGL.laneBottom - RLGL.laneTop + 150);
  }

  function frame(now: number) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1); // don't leap ahead after a paused tab
    last = now;
    time += dt;

    const state = live();
    const moving = scene === 'play' && (state.phase === 'travel' || state.phase === 'minigame');
    const levelId: LevelId = moving ? LEVEL_FOR_GAME[state.miniGame] ?? 'oak' : 'oak';
    const level = getLevel(levelId);
    const ratio = canvas.width / innerWidth;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = MOSS;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!level) return; // the picture is still loading

    // On the oak everyone stands at their spot; on a mini-game level players walk freely.
    const free = moving && levelId !== 'oak';
    const key = `${scene}:${levelId}:${state.round}`;
    const fresh = key !== levelKey;
    levelKey = key;
    if (!free) { canWalk = false; walkTarget = null; if (fresh) clearWorldHud(); }

    const roster = scene === 'attract'
      ? VARIANTS.slice(0, 6).map((look, i) => ({ id: `demo-${i}`, name: '', look: look.id as string, x: 0, z: 0, eliminated: false, finished: false }))
      : state.players.map((player) => ({ ...player, look: variantFor(player.id, state.selfId) as string }));
    for (const id of bots.keys()) if (!roster.some((player) => player.id === id)) bots.delete(id);

    roster.forEach((player, index) => {
      let bot = bots.get(player.id);
      if (!bot) {
        bot = { look: player.look, name: player.name, x: 0, y: 0, facing: 'front', flip: false, moving: false, eliminated: false, isSelf: false, placed: false, emote: '', emoteUntil: 0, offset: index * 1.37 };
        bots.set(player.id, bot);
      }
      bot.look = player.look;
      bot.name = player.name;
      bot.eliminated = player.eliminated;
      bot.isSelf = scene !== 'attract' && player.id === state.selfId;

      let target: Spot;
      if (!free) target = level.spawns[index % level.spawns.length] ?? { x: 960, y: 760 };
      else if (bot.isSelf) {
        // The server puts everyone on the start line; pick our own spot up from it.
        if (fresh || !bot.placed) { Object.assign(local, toPixels(level, player.x, player.z)); lastSent.x = Infinity; sawFinish = false; }
        stepSelf(dt, state, level, bot, player);
        target = local;
      } else target = toPixels(level, player.x, player.z);

      const fromX = bot.x;
      const fromY = bot.y;
      if (fresh || !bot.placed || bot.isSelf) { bot.x = target.x; bot.y = target.y; }
      else {
        const ease = 1 - Math.exp(-dt * 10);
        bot.x += (target.x - bot.x) * ease;
        bot.y += (target.y - bot.y) * ease;
      }
      const stepX = bot.x - fromX;
      const stepY = bot.y - fromY;
      bot.moving = !fresh && bot.placed && Math.hypot(stepX, stepY) / Math.max(dt, 0.001) > 25;
      bot.placed = true;
      if (bot.moving) {
        if (Math.abs(stepX) > Math.abs(stepY) * 1.2) { bot.facing = 'side'; bot.flip = stepX < 0; }
        else bot.facing = stepY > 0 ? 'front' : 'back';
      } else if (!free) bot.facing = 'front'; // gathered round the oak, facing us
    });

    // Draw: level, ground effects, robots nearest-last, name tags, then the red-light wash.
    ctx.setTransform(view.scale * ratio, 0, 0, view.scale * ratio, view.left * ratio, view.top * ratio);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(level.image, 0, 0, LEVEL_WIDTH, LEVEL_HEIGHT);
    const light = free && level.id === 'rlgl' && state.phase === 'minigame' ? state.signal : null;
    if (light) drawRlgl(light === 'green');

    const order = [...bots.values()].sort((a, b) => a.y - b.y);
    for (const bot of order) {
      if (bot.isSelf && free && !bot.eliminated) {
        ctx.strokeStyle = 'rgba(88, 190, 240, 0.9)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.ellipse(bot.x, bot.y, 62, 24, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      drawBot(bot, level);
    }
    if (scene !== 'attract') for (const bot of order) drawNameTag(bot, level);
    if (light === 'red') {
      ctx.fillStyle = `rgba(150, 0, 16, ${0.16 + Math.sin(time * 9) * 0.04})`;
      ctx.fillRect(0, 0, LEVEL_WIDTH, LEVEL_HEIGHT);
    }
  }
  requestAnimationFrame(frame);

  return {
    setScene(next: GameScene) {
      if (next === scene) return;
      scene = next;
      levelKey = '';
      keys.clear();
      walkTarget = null;
      if (next !== 'play') clearWorldHud();
    },
  };
}

export type Game = ReturnType<typeof createGame>;
