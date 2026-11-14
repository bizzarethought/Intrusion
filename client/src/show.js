import * as THREE from 'three';
import { createRobot, resetPose, relaxPose, applyExpression, facing } from './robots.js';
import { blowBubbles, chaseButterfly, sitOnRock, lookAround, dance } from './behaviours.js';
import { createCorruption } from './corruption.js';
import { SIT_ROCK, CAMERA_SIDE } from './meadow.js';

// The loading-screen sequence, in seconds.
const QUAKE_AT = 15.4; // ground shakes, robots go rigid
const CORRUPT_AT = 17.9; // one robot drops and glitches; the others rush over
const TITLE_AT = 24.9; // camera is on the sky, title appears
const FADE_AT = 27.5;
const END_AT = 29;

const SPACING = 4; // room each robot gets when scattered
const RUN_SPEED = 5.5;
const CENTRE = new THREE.Vector3(0, 1.5, 0);
// Facing angle that points a robot straight at the wide camera. Robots only
// ever face within a quarter turn of this, so the camera never sees their backs
// while they play.
const TOWARD_CAMERA = Math.atan2(Math.cos(CAMERA_SIDE), Math.sin(CAMERA_SIDE));

function smooth(x) {
  x = Math.min(1, Math.max(0, x));
  return x * x * (3 - 2 * x);
}

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// Brings an angle into the range -PI..PI.
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
// Unit vector for a facing angle.
const direction = (angle) => new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
// A point at this height above a robot's spot.
const at = (robot, height) => robot.root.position.clone().setY(height);

// Camera spot in front of a robot, looking back at its face.
function inFrontOf(robot, distance, height, sideways) {
  const forward = facing(robot);
  return robot.root.position.clone()
    .addScaledVector(forward, distance)
    .addScaledVector(new THREE.Vector3(forward.z, 0, -forward.x), sideways)
    .setY(height);
}

// Camera spot for wide shots, on the side of the meadow kept clear of trees.
function wideShot(swing, distance, height) {
  return new THREE.Vector3(Math.cos(CAMERA_SIDE + swing) * distance, height, Math.sin(CAMERA_SIDE + swing) * distance);
}

// Angle a robot must face to look at a point.
function angleTo(robot, point) {
  return Math.atan2(point.x - robot.root.position.x, point.z - robot.root.position.z);
}

// Turns a robot part of the way toward an angle.
function turnToward(robot, wanted, amount) {
  robot.root.rotation.y += wrap(wanted - robot.root.rotation.y) * Math.min(1, amount);
}

// Puts each robot somewhere random near the middle, not too close to the
// others or the rock, facing somewhere on the camera's side.
function scatter(robots) {
  const radius = Math.max(6, 2.8 * Math.sqrt(robots.length));
  const taken = [new THREE.Vector3(SIT_ROCK.x, 0, SIT_ROCK.z)];
  for (const robot of robots) {
    const spot = new THREE.Vector3();
    for (let tries = 0; tries < 300; tries++) {
      const angle = Math.random() * Math.PI * 2;
      spot.set(Math.cos(angle), 0, Math.sin(angle)).multiplyScalar(Math.sqrt(Math.random()) * radius);
      if (taken.every((other) => other.distanceTo(spot) > SPACING)) break;
    }
    taken.push(spot);
    robot.root.position.copy(spot);
    robot.root.rotation.y = TOWARD_CAMERA + (Math.random() - 0.5) * 2.6;
  }
}

// The facing angle, within `spread` of the camera's side, from which a robot
// has the clearest view: a camera `reach` in front of it is not blocked.
function clearestFacing(robot, robots, reach, spread) {
  const toOther = new THREE.Vector3();
  let best = TOWARD_CAMERA;
  let bestGap = -1;
  for (const k of shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8])) {
    const angle = TOWARD_CAMERA + (k / 4 - 1) * spread;
    const dir = direction(angle);
    let gap = Infinity;
    for (const other of robots) {
      if (other === robot) continue;
      toOther.subVectors(other.root.position, robot.root.position);
      const along = Math.min(reach, Math.max(0, toOther.dot(dir)));
      gap = Math.min(gap, toOther.addScaledVector(dir, -along).length());
    }
    if (gap > bestGap) [best, bestGap] = [angle, gap];
  }
  return best;
}

// Builds the robots for `lobby` (one { color, accessory } per robot) and runs
// the sequence. update(delta) returns true once the sequence has finished.
export function createShow(scene, camera, gltf, lobby, startAt = 0) {
  const group = new THREE.Group();
  scene.add(group);

  // Scatter the robots and give each something to do. Which robot gets which
  // activity is random; there is always one blowing bubbles and one on the rock.
  const robots = lobby.map((look) => createRobot(gltf, look));
  scatter(robots);
  const activities = [blowBubbles, sitOnRock, chaseButterfly, lookAround, dance];
  const extras = [chaseButterfly, lookAround, dance, blowBubbles];
  const order = shuffle([...robots]);
  order.forEach((robot, k) => {
    group.add(robot.root);
    const idle = activities[k] ?? extras[k % extras.length];
    robot.sitting = idle === sitOnRock;
    robot.idle = idle(robot, group, k);
    robot.stride = 0; // 0 standing still .. 1 running flat out
    robot.stood = 0; // 0 still seated .. 1 up on its feet (only matters for the sitter)
  });
  const first = order[0]; // the two robots that get a close-up
  const second = order[1];
  for (const robot of [first, second]) robot.root.rotation.y = clearestFacing(robot, robots, 7, 1);

  // The AI takes over a random robot (not the one sitting on the rock).
  const standing = robots.filter((robot) => !robot.sitting);
  const target = standing[Math.floor(Math.random() * standing.length)];
  const others = robots.filter((robot) => robot !== target);
  const corruption = createCorruption(target, group);
  let targetFacing = 0;

  // Camera keyframes: where the camera should be and what it should look at,
  // at each time. `lift` arcs it upward on the way so it clears the robots' heads.
  const keys = [
    { t: 0, pos: wideShot(0, 30, 12), look: CENTRE }, // pan in
    { t: 3.8, pos: wideShot(0.12, 13, 7), look: CENTRE },
    { t: 5.85, pos: inFrontOf(first, 6, 2.4, 1.4), look: at(first, 2), lift: 1.5 }, // close on one robot
    { t: 8.35, pos: inFrontOf(first, 5.5, 2.4, 0.6), look: at(first, 2) },
    { t: 10.4, pos: inFrontOf(second, 6, 2.6, -1.4), look: at(second, 2), lift: 2.5 }, // pan to another
    { t: 12.9, pos: inFrontOf(second, 5.5, 2.6, -0.6), look: at(second, 2) },
    { t: QUAKE_AT, pos: wideShot(-0.1, 15, 7), look: CENTRE, lift: 1.5 }, // back out, slow drift
    { t: CORRUPT_AT, pos: wideShot(0.05, 16, 7.5), look: CENTRE },
  ];

  function startCorruption() {
    // The fallen robot turns toward the camera's side, wherever its view is clearest.
    targetFacing = clearestFacing(target, robots, 8, 0.5);
    const front = direction(targetFacing);
    const side = new THREE.Vector3(front.z, 0, -front.x);
    const behind = targetFacing + Math.PI;

    // The others gather behind it in rows, a robot's width apart.
    const slots = [];
    for (let row = 0; slots.length < others.length; row++) {
      const radius = 3.8 + row * 2.9;
      const gap = 2.7 / radius; // angle between neighbours in this row
      const count = Math.min(others.length - slots.length, Math.floor(2.16 / gap) + 1);
      for (let j = 0; j < count; j++) slots.push({ angle: (j - (count - 1) / 2) * gap, radius });
    }
    // Hand out the spots left to right, so the robots don't cross paths.
    slots.sort((a, b) => a.angle - b.angle);
    others.sort((a, b) => wrap(angleTo(target, a.root.position) - behind) - wrap(angleTo(target, b.root.position) - behind));
    others.forEach((robot, k) => {
      robot.goal = target.root.position.clone().addScaledVector(direction(behind + slots[k].angle), slots[k].radius);
      robot.neighbours = [others[k - 1] ?? others[k + 1], others[k + 1] ?? others[k - 1]];
      robot.noticeAt = Math.random() * 0.3; // seconds after the fall
      robot.leaveAt = robot.noticeAt + 0.9; // a look, a glance at a neighbour, then run
    });

    // Pull the camera back just far enough that the whole group fits the
    // screen, whatever its shape, then tilt up to the sky for the title.
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    let distance = 6;
    for (const robot of others) {
      const offset = robot.goal.clone().sub(target.root.position);
      distance = Math.max(distance, (Math.abs(offset.dot(side)) + 1.8) / tanHalf + offset.dot(front));
    }
    distance = Math.min(distance, 16);
    const height = 2.5 + distance * 0.1;
    const settle = at(target, height).addScaledVector(front, distance * 0.92).addScaledVector(side, -0.4);
    const sky = settle.clone().addScaledVector(front, -4).setY(height + 12);
    keys.push(
      { t: CORRUPT_AT + 1.7, pos: at(target, height).addScaledVector(front, distance).addScaledVector(side, 0.8), look: at(target, 1.7), lift: 1 },
      { t: CORRUPT_AT + 5.2, pos: settle, look: at(target, 1.7) },
      { t: CORRUPT_AT + 8.1, pos: settle, look: sky },
      { t: END_AT + 1, pos: settle, look: sky }
    );
  }

  // How one of the other robots reacts to the fall: it turns to stare, glances
  // at a neighbour, runs over, then keeps looking between the fallen robot
  // and its neighbours.
  const step = new THREE.Vector3();
  function react(robot, delta, t) {
    const since = t - CORRUPT_AT - robot.noticeAt;
    if (since < 0) return;
    const position = robot.root.position;
    const distance = step.subVectors(robot.goal, position).length();
    const leaving = t - CORRUPT_AT >= robot.leaveAt;
    const running = leaving && distance > 0.15;
    robot.stride += ((running ? 1 : 0) - robot.stride) * Math.min(1, delta * 8);

    if (leaving) {
      robot.walking = true;
      robot.stood = Math.min(1, robot.stood + delta * 3); // the sitter gets up
      // Speed builds up with the stride and eases off on arrival.
      position.addScaledVector(step.normalize(), Math.min(distance, Math.min(RUN_SPEED * robot.stride, distance * 5) * delta));
      // Go around the fallen robot, not through it.
      step.subVectors(position, target.root.position);
      if (step.length() < 3.2) position.copy(target.root.position).addScaledVector(step.normalize(), 3.2);
    }
    turnToward(robot, running ? angleTo(robot, robot.goal) : angleTo(robot, target.root.position), delta * 7);

    // Running: quick hops, leaning forward.
    const hop = Math.sin(t * 13);
    robot.model.position.y += Math.abs(hop) * 0.3 * robot.stride;
    robot.feet[0].position.y += Math.max(0, hop) * 0.25 * robot.stride;
    robot.feet[1].position.y += Math.max(0, -hop) * 0.25 * robot.stride;
    robot.head.rotation.z -= 0.22 * robot.stride;

    // Standing: a quick worried glance at a neighbour every so often.
    const cycle = since * 0.8 + 0.75;
    const neighbour = robot.neighbours[Math.floor(cycle) % 2];
    if (neighbour) {
      const phase = cycle % 1;
      const glance = smooth(phase / 0.12) * (1 - smooth((phase - 0.4) / 0.12));
      const yaw = THREE.MathUtils.clamp(wrap(angleTo(robot, neighbour.root.position) - robot.root.rotation.y), -1.1, 1.1);
      robot.head.rotation.y += yaw * glance * (1 - robot.stride);
    }
  }

  // Nudges robots apart if they bump into each other on the way over.
  function keepApart(delta) {
    for (let a = 0; a < others.length; a++) {
      for (let b = a + 1; b < others.length; b++) {
        if (!others[a].walking || !others[b].walking) continue;
        const gap = step.subVectors(others[b].root.position, others[a].root.position).length();
        if (gap > 2.6 || gap < 0.001) continue;
        step.multiplyScalar(((2.6 - gap) / gap) * 0.5 * Math.min(1, delta * 10));
        others[a].root.position.sub(step);
        others[b].root.position.add(step);
      }
    }
  }

  // The camera does not jump to its keyframed spot: it chases it, which rounds
  // off every start, stop and change of direction.
  const wantPos = new THREE.Vector3();
  const wantLook = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  let cameraPlaced = false;
  function moveCamera(t, delta) {
    let i = keys.length - 2;
    while (i > 0 && keys[i].t > t) i--;
    const from = keys[i];
    const to = keys[i + 1];
    const mix = smooth((t - from.t) / (to.t - from.t));
    wantPos.lerpVectors(from.pos, to.pos, mix);
    wantPos.y += Math.sin(Math.PI * mix) * (to.lift ?? 0);
    wantLook.lerpVectors(from.look, to.look, mix);
    const follow = cameraPlaced ? 1 - Math.exp(-delta * 5) : 1;
    cameraPlaced = true;
    camera.position.copy(camPos.lerp(wantPos, follow));
    camera.lookAt(camLook.lerp(wantLook, follow));
  }

  let t = startAt;
  let corrupting = false;

  function update(delta) {
    t += delta;
    const alarm = t - QUAKE_AT; // seconds since the quake began
    // Quake strength: swells and fades over 3 seconds, then a faint rumble while the robot glitches.
    const quake = Math.sin(Math.PI * smooth(alarm / 3)) + (corrupting && t < CORRUPT_AT + 4 ? 0.2 : 0);

    if (!corrupting && t >= CORRUPT_AT) {
      corrupting = true;
      startCorruption();
    }

    robots.forEach((robot, i) => {
      resetPose(robot);
      robot.idle.update(t, delta, alarm);
      if (corrupting && robot === target) {
        relaxPose(robot, 1);
        turnToward(robot, targetFacing, delta * 6);
        corruption.update(t - CORRUPT_AT, delta);
      } else {
        // When the quake hits, ease out of the activity and go rigid.
        // The sitter stays seated until it gets up to run.
        relaxPose(robot, robot.sitting ? smooth(robot.stood) : smooth(alarm / 0.4));
        if (alarm > 0) robot.expression = 'sus';
        else if ((t + i * 1.7) % 3.5 < 0.16) robot.expression = 'blink';
        if (corrupting) react(robot, delta, t);
      }
      robot.model.position.y += Math.abs(Math.sin(t * 20 + i)) * 0.06 * quake; // rattled by the quake
      applyExpression(robot, delta);
      if (robot.spin) robot.spin.rotation.y = t * 8;
    });
    if (corrupting) keepApart(delta);

    moveCamera(t, delta);
    camera.position.x += Math.sin(t * 41) * 0.14 * quake;
    camera.position.y += Math.sin(t * 53 + 1) * 0.1 * quake;

    document.body.classList.toggle('title', t >= TITLE_AT);
    document.body.classList.toggle('fade', t >= FADE_AT);
    return t >= END_AT;
  }

  function dispose() {
    scene.remove(group);
    group.traverse((object) => {
      object.geometry?.dispose();
      object.material?.map?.isCanvasTexture && object.material.map.dispose();
      object.material?.dispose();
    });
  }

  return { update, dispose };
}
