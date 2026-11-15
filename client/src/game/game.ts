import { setBotScale } from './botTransform';
import { createFx } from './fx';
import { frameProfiler } from './performance';
import { Application, Assets, Container, Graphics, Sprite, Texture, Rectangle } from 'pixi.js';
import { variantFor } from '../assets/looks';
import { VARIANTS } from '../assets/manifest';
import { play } from '../audio';
import { live, onCaught, send } from '../protocol/roomClient';
import { clearWorldHud, setWorldHud } from '../scene/worldHud';
import { BRIDGE, COLLISION_HEIGHT, COLLISION_WIDTH, DEPTH_SQUASH, LEVEL_FOR_GAME, LEVEL_HEIGHT, LEVEL_WIDTH, RLGL, SIDES, bankAt, loadLevel, onGround, overBridge, platformAt, toMeters, toPixels, walkable, type Level, type LevelId, type Spot } from './levels';
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
const MOSS = '#10190f'; // shown only until the level's picture has loaded
const HOP = 0.28; // seconds in the air between two stepping stones or glass panels
/** Centre of a glass panel from its "column:row" name. */
const panelAt = (key: string): Spot => {
  const [col, row] = key.split(':').map(Number);
  return { x: BRIDGE.firstX + col * BRIDGE.columnWidth, y: BRIDGE.rowY[row] };
};

type Bot = {
  look: string;
  name: string;
  x: number;
  y: number;
  facing: 'side' | 'front' | 'back';
  flip: boolean; // side frames face right; flip them to face left
  moving: boolean;
  /** Keeps the walk animation on through tiny gaps in movement, so it doesn't flicker to idle. */
  movingUntil: number;
  eliminated: boolean;
  isSelf: boolean;
  placed: boolean;
  emote: string;
  emoteUntil: number;
  offset: number; // so robots don't animate in unison
  /** Where the robot is drawn. Usually x, y; over water it is the stone or glass panel it stands on, or a point mid-jump. */
  shown: Spot;
  /** Height above `shown`, in pixels, while jumping. */
  lift: number;
  /** The stepping stone or glass panel the robot stands on, the spot its current jump began at, and when. */
  perch: string;
  hopFrom: Spot;
  hopAt: number;
  /** The last solid ground it stood on: where it waits, at the water's edge, until it steps onto a panel. */
  ground: Spot;
};

/** Pick a Side: a soft wash of colour over one bank's grass, so each answer has a place you can see. */
function bankGlow(level: Level, left: boolean): Sprite {
  const hard = document.createElement('canvas');
  hard.width = COLLISION_WIDTH; hard.height = COLLISION_HEIGHT;
  const ctx = hard.getContext('2d')!;
  ctx.fillStyle = '#fff';
  for (let y = 0; y < COLLISION_HEIGHT; y++) for (let x = 0; x < COLLISION_WIDTH; x++) {
    if (y * 4 <= SIDES.bottom && onGround(level, x * 4, y * 4) && bankAt(x * 4, y * 4) === (left ? 'a' : 'b')) ctx.fillRect(x, y, 1, 1);
  }
  const soft = document.createElement('canvas');
  soft.width = COLLISION_WIDTH; soft.height = COLLISION_HEIGHT;
  const blur = soft.getContext('2d')!;
  blur.filter = 'blur(2px)';
  blur.drawImage(hard, 0, 0);
  const sprite = new Sprite(Texture.from(soft));
  sprite.width = LEVEL_WIDTH; sprite.height = LEVEL_HEIGHT;
  sprite.tint = left ? 0xff3344 : 0x2f8fff;
  return sprite;
}

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
  // Drawn over the level and under the robots: open water where a bridge panel broke, and landing ripples...
  const platforms = new Graphics();
  // ...and the bridge's own art: the memory flash, a panel giving way, the splash it leaves.
  const bridgeArt = new Container();
  const art = { cracked: Texture.EMPTY, splash: [] as Texture[] };
  const lit = Array.from({ length: 7 }, () => {
    const sprite = new Sprite(); sprite.anchor.set(0.5); sprite.tint = 0xffe98a; sprite.visible = false;
    return bridgeArt.addChild(sprite);
  });
  Promise.all(['panel_lit', 'panel_cracked', 'splash_sheet'].map((name) => Assets.load<Texture>(`/assets/levels/${name}.png`))).then(([flash, cracked, splash]) => {
    for (const sprite of lit) sprite.texture = flash;
    art.cracked = cracked;
    art.splash = Array.from({ length: 8 }, (_, i) => new Texture({ source: splash.source, frame: new Rectangle(i * 128, 0, 128, 128) }));
  }).catch(() => {}); // without the art the bridge still plays: panels just turn to water
  /** A cracked panel sinking, or a splash playing once. */
  let effects: Array<{ sprite: Sprite; from: number; y: number; splash: boolean }> = [];
  // Robots and the things they can walk behind share this layer, drawn in order of where they touch the ground.
  actors.sortableChildren = true;
  let occluders: Sprite[] = [];
  let foregroundTexture: Texture | undefined;
  // Pick a Side: the two banks, each washed in the colour of its answer card.
  const banks = new Container();
  let mySide = '';
  world.addChild(background, banks, platforms, bridgeArt, actors, labels, wash);
  app.stage.addChild(world);
  const fx = createFx();
  if (new URLSearchParams(location.search).has('perf')) Object.assign(window, { intrusionFx: fx.stats });
  world.addChildAt(fx.ground, 1);
  world.addChildAt(fx.foreground, world.getChildIndex(labels));
  const visuals = new Map<Bot, { body: Sprite; label: Sprite; labelKey: string }>();
  const textures = new WeakMap<object, Map<string, Texture>>();
  const ringCanvas = document.createElement('canvas');
  ringCanvas.width = 130; ringCanvas.height = 54;
  const ringCtx = ringCanvas.getContext('2d')!;
  ringCtx.strokeStyle = 'rgba(88,190,240,0.9)'; ringCtx.lineWidth = 5;
  ringCtx.beginPath(); ringCtx.ellipse(65, 27, 62, 24, 0, 0, Math.PI * 2); ringCtx.stroke();
  const ring = new Sprite(Texture.from(ringCanvas)); ring.anchor.set(0.5);
  world.addChildAt(ring, 1);
  /** Rings that spread from a panel or a stepping stone as a robot steps onto it. */
  let ripples: Array<{ x: number; y: number; from: number }> = [];
  let knownBroken = '';
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

  // The level is scaled to fill the window, whatever its shape: no bars. The part that does not fit is
  // cropped, and the view slides (see `camera`) so the local player is never in the cropped part.
  const view = { scale: 1, left: 0, top: 0 };
  const camera: Spot = { x: LEVEL_WIDTH / 2, y: LEVEL_HEIGHT / 2 }; // the point of the level in the middle of the window
  function resize() {
    const ratio = Math.min(devicePixelRatio, 1.5);
    app.renderer.resolution = ratio;
    app.renderer.resize(innerWidth, innerHeight);
    view.scale = Math.max(innerWidth / LEVEL_WIDTH, innerHeight / LEVEL_HEIGHT);
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
      name: bot.name, isSelf: bot.isSelf, x: bot.x, y: bot.y, shown: bot.shown, lift: bot.lift, perch: bot.perch,
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
    const bridge = level.id === 'bridge';
    // Nobody walks in Prompt Podium, and Pick a Side locks once the choices are counted.
    canWalk = playing && !bot.eliminated && level.id !== 'podium' && !(level.id === 'side' && state.stage !== 'choose');
    const server = toPixels(level, me.x, me.z);
    if (wasCaught) {
      // The server has put us back at the start: the rose saw us move, or a glass panel gave way.
      wasCaught = false;
      Object.assign(local, server);
      walkTarget = null;
      result = bridge ? 'That panel was not safe. Back to the bank.' : 'The rose saw you move. Back to the start.';
      resultUntil = time + 3;
      bot.emote = 'emote_angry';
      bot.emoteUntil = time + 1.5;
      play('caught');
    } else if (Math.hypot(local.x - server.x, local.y - server.y) > level.pixelsPerMeter) {
      Object.assign(local, server); // we drifted from where the server has us (it limits speed and edges)
    }
    if (me.finished && !sawFinish) {
      result = bridge ? 'You made it across!' : 'Across the line!';
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
      if (walkable(level, x, y)) { local.x = x; local.y = y; }
      else if (walkable(level, x, local.y)) local.x = x;
      else if (walkable(level, local.x, y)) local.y = y;
      else walkTarget = null;
    }

    if (state.signal && state.signal !== lastSignal) play(state.signal === 'green' ? 'go' : 'stop');
    lastSignal = state.signal;
    let objective = '';
    if (bot.eliminated) objective = 'You were voted out. You can still watch.';
    else if (level.id === 'podium') objective = ''; // the answer panel says what to do
    else if (level.id === 'side') {
      objective = !playing ? 'Read the question. The red bank on the left is one answer, the blue bank on the right is the other.'
        : state.stage === 'choose' ? 'Hop across the stones to the bank of your answer before time runs out.' : 'Choices are locked in.';
    } else if (bridge) {
      objective = !playing ? 'Memorise the lit panels. They go dark when you start.'
        : me.finished ? 'You crossed. Watch who remembers, and who guesses.' : 'Cross on the panels that were lit.';
    } else if (!playing) objective = 'Get ready. Run when the rose opens.';
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
    // Pick a Side: which bank we are on, by the same lines the server counts with.
    const side = level.id !== 'side' || bot.eliminated ? '' : bankAt(local.x, local.y);
    mySide = side;
    setWorldHud({ objective, distance: 0, bearing: null, signal: playing ? state.signal : null, result, scored: me.finished, side });
  }

  function drawBot(bot: Bot, level: Level) {
    let visual = visuals.get(bot);
    if (!visual) {
      const body = new Sprite();
      const label = new Sprite();
      body.anchor.set(ANCHOR.x, ANCHOR.y); label.anchor.set(0.5, 1);
      visual = { body, label, labelKey: '' };
      visuals.set(bot, visual);
      actors.addChild(body); labels.addChild(label);
    }
    const { body, label } = visual;
    const size = (CELL * level.botHeight) / BODY_HEIGHT;
    // The sprites carry their own soft shadow; a second, fixed one looked wrong over water.
    const sheet = botSheet(bot.look);
    // Nothing is drawn until the robot's sheet has loaded: no placeholder shape.
    body.visible = Boolean(sheet);
    if (sheet) {
      const clock = time + bot.offset;
      const emoting = !bot.moving && time < bot.emoteUntil;
      let animation = `${bot.moving ? 'walk' : 'idle'}_${bot.facing}`;
      if (bot.eliminated) animation = 'deactivated';
      else if (emoting) animation = bot.emote;
      else if (!bot.moving && clock % 4 < 0.15 && bot.facing !== 'back') animation = bot.facing === 'side' ? 'blink_side' : 'emote_blink';
      const frames = sheet.animations[animation] ?? [animation];
      // Idle: hold one frame and let it breathe, feet planted. The idle frames step at 6 a second,
      // which read as a stutter, and lifting the whole robot read as floating.
      const idle = animation.startsWith('idle_');
      const name = idle ? frames[0] : frames[Math.floor(clock * (sheet.fps[animation] ?? 6)) % frames.length];
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
      if (idle) body.scale.y *= 1 + Math.sin(clock * 2.4) * 0.012;
      // A slight squash as it lands from a jump.
      const landed = (time - bot.hopAt - HOP) / 0.14;
      if (landed >= 0 && landed < 1) body.scale.y *= 0.9 + 0.1 * landed;
      body.position.set(bot.shown.x, bot.shown.y - bot.lift);
      body.zIndex = bot.shown.y;
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
    label.position.set(Math.min(LEVEL_WIDTH - label.width / 2 - 8, Math.max(label.width / 2 + 8, bot.shown.x)), bot.shown.y - bot.lift - size * 0.84 + 19);
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
        visual.body.destroy(); visual.label.destroy(); visuals.delete(bot);
      }
      bots.delete(id);
    }

    roster.forEach((player, index) => {
      let bot = bots.get(player.id);
      if (!bot) {
        bot = { look: player.look, name: player.name, x: 0, y: 0, facing: 'front', flip: false, moving: false, movingUntil: 0, eliminated: false, isSelf: false, placed: false, emote: '', emoteUntil: 0, offset: index * 1.37, shown: { x: 0, y: 0 }, lift: 0, perch: '', hopFrom: { x: 0, y: 0 }, hopAt: -Infinity, ground: { x: 0, y: 0 } };
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
      if (!fresh && bot.placed && Math.hypot(stepX, stepY) / Math.max(dt, 0.001) > 25) bot.movingUntil = time + 0.12;
      bot.moving = time < bot.movingUntil;
      if (bot.moving) {
        if (Math.abs(stepX) > Math.abs(stepY / DEPTH_SQUASH) * 1.2) { bot.facing = 'side'; bot.flip = stepX < 0; }
        else bot.facing = stepY > 0 ? 'front' : 'back';
      } else if (!free) bot.facing = 'front'; // gathered round the oak, facing us

      // Nobody wades. Over water a robot is always drawn standing on something, and jumps from one
      // footing to the next: the nearest stepping stone in Pick a Side; on the bridge, the glass panel
      // it last stepped onto, or the bank until it steps onto one.
      let rest: Spot = bot;
      let perch = '';
      if (free && level.id === 'side' && !onGround(level, bot.x, bot.y)) {
        const stone = SIDES.stones.reduce((best, each) => (Math.abs(each[0] - bot.x) < Math.abs(best[0] - bot.x) ? each : best));
        rest = { x: stone[0] + ((index % 3) - 1) * 28, y: stone[1] + (index % 2) * 10 - 5 }; // a little apart when several share a stone
        perch = String(stone[0]);
      } else if (free && level.id === 'bridge' && overBridge(level, bot.x, bot.y)) {
        // Between panels it is still on the last one; the server, too, only counts the middle of a panel.
        perch = platformAt('bridge', bot.x, bot.y)?.key ?? bot.perch;
        rest = perch ? panelAt(perch) : bot.ground;
      } else bot.ground = { x: bot.x, y: bot.y };
      if (perch !== bot.perch) {
        // A jump, unless it is too far to be one (sent back to the bank after a fall).
        if (!fresh && bot.placed && Math.hypot(rest.x - bot.shown.x, rest.y - bot.shown.y) < 245) {
          bot.hopFrom = { ...bot.shown };
          bot.hopAt = time;
          if (perch) ripples.push({ x: rest.x, y: rest.y, from: time + HOP }); // the footing takes the weight as it lands
        } else bot.hopAt = -Infinity;
        bot.perch = perch;
      }
      const air = (time - bot.hopAt) / HOP; // 0 at take-off, 1 on landing
      if (air < 1) {
        bot.shown = { x: bot.hopFrom.x + (rest.x - bot.hopFrom.x) * air, y: bot.hopFrom.y + (rest.y - bot.hopFrom.y) * air };
        bot.lift = Math.sin(air * Math.PI) * 44;
        bot.moving = true; bot.facing = 'side'; bot.flip = rest.x < bot.hopFrom.x;
      } else {
        bot.shown = { x: rest.x, y: rest.y };
        bot.lift = 0;
        if (perch || rest !== bot) { bot.moving = false; bot.facing = 'front'; } // standing on its footing, not walking on the spot
      }
      bot.placed = true;
    });

    // Follow the local player on a mini-game level. Under the oak, and while everyone memorises the
    // bridge (all seven columns should be in view), frame the middle of the level instead.
    const self = [...bots.values()].find((bot) => bot.isSelf);
    const overview = !free || !self || (level.id === 'bridge' && state.phase === 'travel');
    const focus = overview ? { x: LEVEL_WIDTH / 2, y: LEVEL_HEIGHT / 2 } : self.shown;
    const ease = fresh ? 1 : Math.min(1, dt * 4);
    camera.x += (focus.x - camera.x) * ease;
    camera.y += (focus.y - camera.y) * ease;
    view.left = Math.min(0, Math.max(innerWidth - LEVEL_WIDTH * view.scale, innerWidth / 2 - camera.x * view.scale));
    view.top = Math.min(0, Math.max(innerHeight - LEVEL_HEIGHT * view.scale, innerHeight / 2 - camera.y * view.scale));
    world.scale.set(view.scale); world.position.set(view.left, view.top);
    if (drawnLevel !== level) {
      backgroundTexture?.destroy(true);
      backgroundTexture = Texture.from(level.image);
      background.texture = backgroundTexture;
      background.width = LEVEL_WIDTH; background.height = LEVEL_HEIGHT;
      // Boulders and big roses are cut out of the foreground layer and sorted with the robots, so a
      // robot can stand behind one. Not where nobody walks: the oak, and the podium boulders robots stand on.
      for (const sprite of occluders) sprite.destroy({ texture: true });
      foregroundTexture?.destroy(true);
      foregroundTexture = level.foreground && level.id !== 'oak' && level.id !== 'podium' ? Texture.from(level.foreground) : undefined;
      for (const bank of banks.removeChildren()) bank.destroy({ texture: true, textureSource: true });
      if (level.id === 'side') banks.addChild(bankGlow(level, true), bankGlow(level, false));
      occluders = !foregroundTexture ? [] : level.occluders.map((box) => {
        const sprite = new Sprite(new Texture({ source: foregroundTexture!.source, frame: new Rectangle(box.x, box.y, box.width, box.height) }));
        sprite.position.set(box.x, box.y);
        sprite.zIndex = box.baseY;
        return actors.addChild(sprite);
      });
      drawnLevel = level;
    }
    const onBridge = free && level.id === 'bridge';
    // A panel that just gave way: it tilts, sinks and fades, and leaves a splash.
    if (onBridge && state.broken !== knownBroken) {
      const before = knownBroken.split(',');
      for (const key of state.broken.split(',')) {
        if (!key || before.includes(key)) continue;
        const { x, y } = panelAt(key);
        const cracked = new Sprite(art.cracked); cracked.anchor.set(0.5); cracked.position.set(x, y);
        const splash = new Sprite(); splash.anchor.set(0.5); splash.position.set(x, y); splash.scale.set(1.6);
        bridgeArt.addChild(cracked, splash);
        effects.push({ sprite: cracked, from: time, y, splash: false }, { sprite: splash, from: time + 0.2, y, splash: true });
        play('caught');
      }
    }
    knownBroken = onBridge ? state.broken : '';
    bridgeArt.visible = onBridge;
    effects = effects.filter(({ sprite, from, y, splash }) => {
      const age = time - from;
      const done = age > 0.5 || !onBridge;
      if (done) sprite.destroy();
      else if (splash) { if (age >= 0 && art.splash.length) sprite.texture = art.splash[Math.min(7, Math.floor(age * 16))]; }
      else { sprite.y = y + age * 70; sprite.alpha = Math.max(0, 1 - age / 0.4); }
      return !done;
    });
    // While players memorise: the safe panel in each column lights up.
    lit.forEach((sprite, col) => {
      const row = onBridge ? state.pattern[col] : undefined;
      sprite.visible = row !== undefined;
      if (row !== undefined) { sprite.position.copyFrom(panelAt(`${col}:${row}`)); sprite.alpha = 0.7 + Math.sin(time * 6) * 0.3; }
    });
    ripples = ripples.filter((ripple) => time - ripple.from < 0.7);
    platforms.clear();
    // Panels that have given way: the background still shows them, so open water is drawn over where the glass was.
    if (onBridge) for (const key of state.broken.split(',')) {
      if (!key) continue;
      const { x, y } = panelAt(key);
      platforms.roundRect(x - BRIDGE.panelWidth / 2 - 6, y - BRIDGE.panelHeight / 2 - 6, BRIDGE.panelWidth + 12, BRIDGE.panelHeight + 14, 6).fill(0x2f7090);
    }
    // Pick a Side: each bank glows in its answer's colour, brighter for the one we are standing on.
    banks.visible = free && level.id === 'side';
    banks.children.forEach((bank, i) => { bank.alpha = (mySide === 'ab'[i] ? 0.5 : 0.26) + Math.sin(time * 3) * 0.04; });
    for (const ripple of ripples) {
      const age = (time - ripple.from) / 0.7; // 0 as the robot steps on, 1 when the ring has faded
      if (age < 0) continue; // still in the air
      const reach = 95 * (0.35 + age * 0.65);
      platforms.ellipse(ripple.x, ripple.y, reach, reach * DEPTH_SQUASH).stroke({ width: 4, color: 0xffffff, alpha: (1 - age) * 0.75 });
    }
    const light = free && level.id === 'rlgl' && state.phase === 'minigame' ? state.signal : null;
    fx.update(level, dt, time, light, state.phase);
    for (const bot of bots.values()) drawBot(bot, level);
    ring.visible = !!self && free && !self.eliminated;
    if (self) ring.position.set(self.shown.x, self.shown.y);
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
