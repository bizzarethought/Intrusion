import * as THREE from 'three';
import { SIT_ROCK, CAMERA_SIDE } from './meadow.js';
import { facing } from './robots.js';

// Idle behaviours. Each one takes (robot, group, index) and returns
// { update(time, delta, alarm) }, which poses the robot for this frame.
// The robot is already reset to its standing pose before update runs.
// `alarm` is seconds since the quake started (negative before it). Behaviours
// always pose as if playing; show.js eases the pose back to standing once the
// quake hits, so nothing snaps. They use `alarm` only to stop their props.

function smooth(x) {
  x = Math.min(1, Math.max(0, x));
  return x * x * (3 - 2 * x);
}

export function blowBubbles(robot, group) {
  const BREATH = 2.95; // one blow of bubbles every this many seconds
  const BLOW = 1.05; // how long the blow itself takes; the rest is watching
  const LIFE = 2.8; // seconds a bubble floats before popping

  // A bubble wand floating in front of the face (there are no hands to hold it).
  const wand = new THREE.Group();
  const plastic = new THREE.MeshStandardMaterial({ color: 0xff7eb6, roughness: 0.4 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.035, 16, 48), plastic);
  ring.rotation.y = Math.PI / 2; // the hole faces forward
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.75, 16), plastic);
  handle.position.y = -0.63;
  ring.castShadow = handle.castShadow = true;
  wand.add(ring, handle);
  wand.position.set(1.45, -0.3, -0.2); // just in front of the screen, below the eyes
  wand.rotation.x = 0.3; // handle leans out to one side
  robot.head.add(wand);

  // Soap bubbles: clear with a faint colour each, so they don't read as smoke.
  const geometry = new THREE.SphereGeometry(1, 32, 16);
  const tints = [0xff9ad5, 0x9ad8ff, 0xfff3a0, 0xb6ffb0, 0xd9b3ff];
  const bubbles = Array.from({ length: 7 }, (_, i) => {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: tints[i % tints.length], emissiveIntensity: 0.4,
      transparent: true, opacity: 0.35, roughness: 0, depthWrite: false,
    }));
    group.add(mesh);
    // Each bubble drifts off in its own direction.
    return { mesh, yaw: (Math.random() - 0.5) * 1.3, climb: 0.1 + Math.random() * 0.5, size: 0.13 + Math.random() * 0.17 };
  });
  const mouth = new THREE.Vector3();
  const drift = new THREE.Vector3();

  return {
    update(time, delta, alarm) {
      ring.getWorldPosition(mouth);
      const forward = facing(robot);
      bubbles.forEach((bubble, i) => {
        // Bubbles leave the ring one after another at the start of each breath.
        const age = (time - i * 0.14 + BREATH * 100) % BREATH;
        const blownAfterAlarm = age < alarm;
        bubble.mesh.visible = age < LIFE && !blownAfterAlarm;
        const travel = 2.8 * (1 - Math.exp(-age * 0.9)); // quick out of the ring, then slowing
        drift.copy(forward).applyAxisAngle(THREE.Object3D.DEFAULT_UP, bubble.yaw);
        bubble.mesh.position.copy(mouth).addScaledVector(drift, travel);
        bubble.mesh.position.y += travel * bubble.climb + age * 0.12 + Math.sin(age * 2.5 + i) * 0.08;
        const pop = age > LIFE - 0.12 ? 1.35 : 1;
        bubble.mesh.scale.setScalar(bubble.size * Math.min(1, age * 4) * pop);
      });
      // Lean in to blow, then lean back and watch them float. `blow` rises and
      // falls smoothly, so the head never jumps between the two.
      const breath = time % BREATH;
      const blow = breath < BLOW ? Math.sin((breath / BLOW) * Math.PI) : 0;
      robot.head.position.x += blow * 0.1;
      robot.head.rotation.z = 0.1 - blow * 0.16;
      robot.expression = blow > 0.3 ? null : 'happy';
    },
  };
}

export function chaseButterfly(robot, group) {
  const home = robot.root.position.clone();
  // The butterfly flutters on the camera's side of the robot, so the robot
  // never turns its back to the camera while chasing it.
  const centre = new THREE.Vector3(Math.cos(CAMERA_SIDE), 0, Math.sin(CAMERA_SIDE)).multiplyScalar(2.6).add(home);
  const butterfly = new THREE.Group();
  butterfly.rotation.x = -Math.PI / 2; // wings lie flat
  const wingGeometry = new THREE.PlaneGeometry(0.3, 0.36, 4, 4).translate(0.15, 0, 0); // hinge on the inner edge
  const wingMaterial = new THREE.MeshBasicMaterial({ color: 0xff9a3c, side: THREE.DoubleSide });
  const wings = [1, -1].map((side) => {
    const wing = new THREE.Mesh(wingGeometry, wingMaterial);
    wing.scale.x = side;
    butterfly.add(wing);
    return wing;
  });
  group.add(butterfly);

  // A small figure-eight, so the robot never runs far.
  const flightPath = (time, out) =>
    out.set(centre.x + Math.sin(time * 0.7) * 1.2, 3.4 + Math.sin(time * 2.3) * 0.3, centre.z + Math.sin(time * 1.4) * 0.7);
  const spot = new THREE.Vector3();

  return {
    update(time, delta, alarm) {
      const fleeing = Math.max(0, alarm);
      flightPath(time, butterfly.position);
      butterfly.position.y += fleeing * fleeing * 2; // flies off when the quake hits
      const flap = Math.sin(time * 20) * 0.9;
      wings[0].rotation.y = flap;
      wings[1].rotation.y = -flap;

      // The robot's clock stops at the quake, so it freezes mid-chase instead of jumping.
      const frozen = time - fleeing;
      if (alarm <= 0) {
        // Follow where the butterfly was a moment ago.
        flightPath(frozen - 0.9, spot);
        const position = robot.root.position;
        position.x = home.x + (spot.x - centre.x) * 0.7;
        position.z = home.z + (spot.z - centre.z) * 0.7;
        robot.root.rotation.y = Math.atan2(butterfly.position.x - position.x, butterfly.position.z - position.z);
      }
      const hop = Math.sin(frozen * 6);
      robot.model.position.y = Math.abs(hop) * 0.3;
      robot.feet[0].position.y += Math.max(0, hop) * 0.25;
      robot.feet[1].position.y += Math.max(0, -hop) * 0.25;
      robot.head.rotation.z = 0.3; // looking up at it
      robot.expression = 'happy';
    },
  };
}

export function sitOnRock(robot) {
  robot.root.position.set(SIT_ROCK.x, 0, SIT_ROCK.z);

  return {
    update(time, delta, alarm) {
      if (!robot.walking) {
        // Sit near the front edge, whichever way it faces, so the feet hang off the rock.
        const turn = robot.root.rotation.y;
        robot.root.position.set(SIT_ROCK.x + Math.sin(turn) * 0.6, 0, SIT_ROCK.z + Math.cos(turn) * 0.6);
      }
      const lively = 1 - smooth(alarm / 0.4); // stops nodding and kicking when the quake hits
      // Rest the head ball on top of the rock (0.69 is the gap under a standing head).
      robot.head.position.y += SIT_ROCK.height - 0.69 + Math.abs(Math.sin(time * 3)) * 0.05 * lively;
      robot.head.rotation.x = Math.sin(time * 3) * 0.12 * lively; // nodding along
      robot.feet.forEach((foot, i) => {
        const swing = Math.sin(time * 4 + i * Math.PI) * lively;
        foot.position.x += 0.85 + swing * 0.25;
        foot.position.y += 0.3 + swing * 0.15;
        foot.rotation.z = 0.3 + swing * 0.5;
      });
      robot.expression = 'happy';
    },
  };
}

export function lookAround(robot, group, index) {
  return {
    update(time) {
      robot.head.position.y += Math.sin(time * 2 + index) * 0.06;
      robot.head.rotation.y = Math.sin(time * 0.9 + index) * 0.6;
      robot.model.position.y = Math.max(0, Math.sin(time * 1.1 + index)) ** 12 * 0.5; // a little hop now and then
      robot.expression = null;
    },
  };
}

export function dance(robot) {
  return {
    update(time) {
      const sway = Math.sin(time * 4);
      robot.head.position.z += sway * 0.22;
      robot.head.position.y += Math.abs(Math.cos(time * 4)) * 0.08;
      robot.head.rotation.x = -sway * 0.15;
      robot.feet[0].position.y += Math.max(0, sway) * 0.2;
      robot.feet[1].position.y += Math.max(0, -sway) * 0.2;
      robot.expression = 'happy';
    },
  };
}
