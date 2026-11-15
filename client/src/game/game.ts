import { setBotScale } from './botTransform';
import { createFx } from './fx';
import { frameProfiler } from './performance';
import { Application, Container, Sprite, Texture, Rectangle } from 'pixi.js';
import { variantFor } from '../assets/looks';
import { VARIANTS, variant } from '../assets/manifest';
import { play } from '../audio';
import { live, onCaught, send } from '../protocol/roomClient';
import { clearWorldHud, setWorldHud } from '../scene/worldHud';
import { DEPTH_SQUASH, LEVEL_FOR_GAME, LEVEL_HEIGHT, LEVEL_WIDTH, RLGL, loadLevel, toMeters, toPixels, walkable, type Level, type LevelId, type Spot } from './levels';
import { ANCHOR, BODY_HEIGHT, CELL, botSheet, loadedSheetCount } from './sprites';

// The game view: a batched GPU scene with a pre-rendered level and robot sprites
// on top, nearest last, so they look like they are standing in the scene.
//   attract - the oak level with one demo robot (landing and join screens)
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

export async function createGame(canvas: HTMLCanvasElement) {
  const app = new Application();
  await app.init({ canvas, width: innerWidth, height: innerHeight, resolution: Math.min(devicePixelRatio, 1.5), autoDensity: true, background: MOSS, preference: 'webgl', autoStart: false, antialias: false });
  const world = new Container();
  const background = new Sprite();
  const actors = new Container();
  const labels = new Container();
  const wash = new Sprite(Texture.WHITE);
  wash.tint = 0x960010;
  wash.width = LEVEL_WIDTH; wash.height = LEVEL_HEIGHT;
  world.addChild(background, actors, labels, wash);
  app.stage.addChild(world);
  const fx = createFx();
  if (new URLSearchParams(location.search).has('perf')) Object.assign(window, { intrusionFx: fx.stats });
  world.addChildAt(fx.ground, 1);
  world.addChildAt(fx.foreground, world.getChildIndex(labels));
  const visuals = new Map<Bot, { body: Sprite; shadow: Sprite; label: Sprite; labelKey: string }>();
  const textures = new WeakMap<object, Map<string, Texture>>();
  let depthOrder = '';
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128; shadowCanvas.height = 48;
  const shadowCtx = shadowCanvas.getContext('2d')!;
  shadowCtx.fillStyle = 'rgba(0,0,0,0.34)';
  shadowCtx.beginPath(); shadowCtx.ellipse(64, 24, 64, 24, 0, 0, Math.PI * 2); shadowCtx.fill();
  const shadowTexture = Texture.from(shadowCanvas);
  const ringCanvas = document.createElement('canvas');
  ringCanvas.width = 130; ringCanvas.height = 54;
  const ringCtx = ringCanvas.getContext('2d')!;
  ringCtx.strokeStyle = 'rgba(88,190,240,0.9)'; ringCtx.lineWidth = 5;
  ringCtx.beginPath(); ringCtx.ellipse(65, 27, 62, 24, 0, 0, Math.PI * 2); ringCtx.stroke();
  const ring = new Sprite(Texture.from(ringCanvas)); ring.anchor.set(0.5);
  world.addChildAt(ring, 1);
  let drawnLevel: Level | undefined;
  let backgroundTexture: Texture | undefined;
  const profiler = frameProfiler();
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
    const ratio = Math.min(devicePixelRatio, 1.5);
    app.renderer.resolution = ratio;
    app.renderer.resize(innerWidth, innerHeight);
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
  if (new URLSearchParams(location.search).has('perf')) Object.assign(window, {
    intrusionPlayers: () => [...bots.values()].map(bot => ({
      name: bot.name, isSelf: bot.isSelf, x: bot.x, y: bot.y,
      facing: bot.facing, moving: bot.moving,
      scaleX: visuals.get(bot)?.body.scale.x, scaleY: visuals.get(bot)?.body.scale.y,
      frameX: visuals.get(bot)?.body.texture.frame.x, frameY: visuals.get(bot)?.body.texture.frame.y,
    })),
  });
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
      // A click target may be closer than one frame's travel: stop on it, never step past it.
      const stride = Math.min(WALK_SPEED * level.pixelsPerMeter * dt, walkTarget ? length : Infinity);
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
    let visual = visuals.get(bot);
    if (!visual) {
      const body = new Sprite(Texture.WHITE);
      const shadow = new Sprite(shadowTexture);
      const label = new Sprite();
      body.anchor.set(ANCHOR.x, ANCHOR.y); shadow.anchor.set(0.5); label.anchor.set(0.5, 1);
      visual = { body, shadow, label, labelKey: '' };
      visuals.set(bot, visual);
      depthOrder = '';
      actors.addChild(shadow, body); labels.addChild(label);
    }
    const { body, shadow, label } = visual;
    const size = (CELL * level.botHeight) / BODY_HEIGHT;
    shadow.position.set(bot.x, bot.y); shadow.width = size * 0.42; shadow.height = size * 0.15;
    const sheet = botSheet(bot.look);
    if (sheet) {
      const clock = time + bot.offset;
      const emoting = !bot.moving && time < bot.emoteUntil;
      let animation = `${bot.moving ? 'walk' : 'idle'}_${bot.facing}`;
      if (bot.eliminated) animation = 'deactivated';
      else if (emoting) animation = bot.emote;
      else if (!bot.moving && clock % 4 < 0.15 && bot.facing !== 'back') animation = bot.facing === 'side' ? 'blink_side' : 'emote_blink';
      const frames = sheet.animations[animation] ?? [animation];
      const name = frames[Math.floor(clock * (sheet.fps[animation] ?? 6)) % frames.length];
      const frame = sheet.frames[name] ?? sheet.frames.idle_front_0;
      if (frame) {
        let framesCache = textures.get(sheet);
        if (!framesCache) { framesCache = new Map(); textures.set(sheet, framesCache); }
        const key = `${frame.x}:${frame.y}`;
        let texture = framesCache.get(key);
        if (!texture) {
          texture = new Texture({ source: Texture.from(sheet.image).source, frame: new Rectangle(frame.x, frame.y, sheet.cell, sheet.cell) });
          framesCache.set(key, texture);
        }
        body.texture = texture;
      }
      body.tint = 0xdecfb5;
      setBotScale(body, size, sheet.cell, bot.flip && bot.facing === 'side' && !bot.eliminated && !emoting);
      body.position.set(bot.x, bot.y - (bot.moving ? Math.abs(Math.sin(clock * 10)) * size * 0.02 : 0));
    } else {
      body.texture = Texture.WHITE; body.tint = variant(bot.look).uiColor;
      body.scale.set(size * 0.3, size * 0.5); body.position.set(bot.x, bot.y);
    }
    const text = bot.isSelf ? `${bot.name} (you)` : bot.name;
    const labelKey = `${text}:${bot.isSelf}`;
    label.visible = !!bot.name;
    if (bot.name && visual.labelKey !== labelKey) {
      const image = document.createElement('canvas');
      const ctx = image.getContext('2d')!;
      ctx.font = '600 24px system-ui, sans-serif';
      image.width = Math.ceil(ctx.measureText(text).width + 26); image.height = 38;
      ctx.font = '600 24px system-ui, sans-serif';
      ctx.fillStyle = bot.isSelf ? '#2a93c6' : 'rgba(16,25,15,0.8)';
      ctx.beginPath(); ctx.roundRect(0, 0, image.width, 36, 18); ctx.fill();
      ctx.fillStyle = '#f3ecd8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, image.width / 2, 18);
      if (visual.labelKey) label.texture.destroy(true);
      label.texture = Texture.from(image); visual.labelKey = labelKey;
    }
    label.position.set(Math.min(LEVEL_WIDTH - label.width / 2 - 8, Math.max(label.width / 2 + 8, bot.x)), bot.y - size * 0.84 + 19);
  }

  function frame(now: number) {
    requestAnimationFrame(frame);
    profiler.begin(now);
    const dt = Math.min((now - last) / 1000, 0.1); // don't leap ahead after a paused tab
    last = now;
    time += dt;

    const state = live();
    const moving = scene === 'play' && (state.phase === 'travel' || state.phase === 'minigame');
    const levelId: LevelId = moving ? LEVEL_FOR_GAME[state.miniGame] ?? 'oak' : 'oak';
    const level = getLevel(levelId);

    if (!level) return; // the picture is still loading

    // On the oak everyone stands at their spot; on a mini-game level players walk freely.
    const free = moving && levelId !== 'oak';
    const key = `${scene}:${levelId}:${state.round}`;
    const fresh = key !== levelKey;
    levelKey = key;
    if (!free) { canWalk = false; walkTarget = null; if (fresh) clearWorldHud(); }

    const roster = scene === 'attract'
      ? VARIANTS.slice(0, 1).map((look, i) => ({ id: `demo-${i}`, name: '', look: look.id as string, x: 0, z: 0, eliminated: false, finished: false }))
      : state.players.map((player) => ({ ...player, look: variantFor(player.id, state.selfId) as string }));
    for (const [id, bot] of bots) if (!roster.some((player) => player.id === id)) {
      const visual = visuals.get(bot);
      if (visual) {
        if (visual.labelKey) visual.label.texture.destroy(true);
        visual.body.destroy(); visual.shadow.destroy(); visual.label.destroy(); visuals.delete(bot);
      }
      bots.delete(id);
    }

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
        // Remote targets already come from the network interpolation buffer.
        bot.x = target.x;
        bot.y = target.y;
      }
      const stepX = bot.x - fromX;
      const stepY = bot.y - fromY;
      bot.moving = !fresh && bot.placed && Math.hypot(stepX, stepY) / Math.max(dt, 0.001) > 25;
      bot.placed = true;
      if (bot.moving) {
        if (Math.abs(stepX) > Math.abs(stepY / DEPTH_SQUASH) * 1.2) { bot.facing = 'side'; bot.flip = stepX < 0; }
        else bot.facing = stepY > 0 ? 'front' : 'back';
      } else if (!free) bot.facing = 'front'; // gathered round the oak, facing us
    });

    world.scale.set(view.scale); world.position.set(view.left, view.top);
    if (drawnLevel !== level) {
      backgroundTexture?.destroy(true);
      backgroundTexture = Texture.from(level.image);
      background.texture = backgroundTexture;
      background.width = LEVEL_WIDTH; background.height = LEVEL_HEIGHT;
      drawnLevel = level;
    }
    const light = free && level.id === 'rlgl' && state.phase === 'minigame' ? state.signal : null;
    fx.update(level, dt, time, light, state.phase);
    const order = [...bots.values()].sort((a, b) => a.y - b.y);
    for (const bot of order) drawBot(bot, level);
    const nextOrder = order.map(bot => `${bot.look}:${bot.offset}`).join('|');
    if (nextOrder !== depthOrder) {
      // Reorder only when depth changes; preserve overlaps rather than grouping by look.
      for (const bot of order) {
        const visual = visuals.get(bot)!;
        actors.setChildIndex(visual.shadow, actors.children.length - 1);
        actors.setChildIndex(visual.body, actors.children.length - 1);
      }
      depthOrder = nextOrder;
    }
    const self = order.find(bot => bot.isSelf);
    ring.visible = !!self && free && !self.eliminated;
    if (self) ring.position.set(self.x, self.y);
    wash.alpha = light === 'red' ? 0.16 + Math.sin(time * 9) * 0.04 : 0;
    app.render();
    profiler.end(bots.size, loadedSheetCount(), app.renderer.resolution, fx.stats);
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

export type Game = Awaited<ReturnType<typeof createGame>>;
