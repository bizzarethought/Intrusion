import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Head ball in the head's own coordinates: front is +x, up is +y, sides are +-z.
export const HEAD_CENTER = new THREE.Vector3(-0.2, 0, -0.2);
const HEAD_RADIUS = 1.2;

export function loadRobotModel() {
  return new GLTFLoader().loadAsync('/assets/models/android_bot.glb');
}

function part(geometry, color, parent) {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

// Primitive stand-ins for the Blender accessories. Each returns a group
// centred on the head ball; `spin` (optional) is a part that rotates.
const ACCESSORIES = {
  horns(color) {
    const group = new THREE.Group();
    for (const side of [-1, 1]) {
      const horn = part(new THREE.ConeGeometry(0.22, 0.7, 32), color, group);
      const tilt = side * 0.6; // lean out to the side
      horn.position.set(0, Math.cos(tilt), Math.sin(tilt)).multiplyScalar(HEAD_RADIUS + 0.25);
      horn.rotation.x = tilt;
    }
    return { group };
  },

  headphones() {
    const group = new THREE.Group();
    const cream = 0xf5e1c8;
    const band = part(new THREE.TorusGeometry(HEAD_RADIUS + 0.1, 0.08, 16, 64, Math.PI), cream, group);
    band.rotation.y = Math.PI / 2; // arch from one side over the top to the other
    for (const side of [-1, 1]) {
      const cup = part(new THREE.CylinderGeometry(0.45, 0.45, 0.25, 48), cream, group);
      cup.rotation.x = Math.PI / 2;
      cup.position.z = side * (HEAD_RADIUS + 0.1);
    }
    return { group };
  },

  propellerCap() {
    const group = new THREE.Group();
    const pink = 0xff6b7a;
    const top = HEAD_RADIUS - 0.25;
    const cap = part(new THREE.SphereGeometry(0.65, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), pink, group);
    cap.position.y = top;
    const brim = part(new THREE.CylinderGeometry(0.4, 0.4, 0.06, 48), pink, group);
    brim.position.set(0.55, top + 0.05, 0);
    const spin = new THREE.Group();
    spin.position.y = top + 0.8;
    part(new THREE.BoxGeometry(1.1, 0.04, 0.16), 0xf5e1c8, spin);
    part(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 16), 0xf5e1c8, spin).position.y = -0.1;
    group.add(spin);
    return { group, spin };
  },

  crown() {
    const group = new THREE.Group();
    const gold = 0xffc933;
    const top = HEAD_RADIUS - 0.1;
    const ring = part(new THREE.CylinderGeometry(0.55, 0.45, 0.3, 48, 1, true), gold, group);
    ring.material.side = THREE.DoubleSide;
    ring.position.y = top + 0.1;
    for (let i = 0; i < 5; i++) {
      const point = part(new THREE.ConeGeometry(0.1, 0.3, 24), gold, group);
      const angle = (i / 5) * Math.PI * 2;
      point.position.set(Math.cos(angle) * 0.52, top + 0.4, Math.sin(angle) * 0.52);
    }
    return { group };
  },
};

// Builds one robot from the loaded model.
// look = { color: hex or null (plain metal), accessory: key of ACCESSORIES or null }
//
// Inside `model`, forward is +x, up is +y and the sides are +-z. The robot has
// no rig, so poses are made by moving `head` and `feet` directly.
export function createRobot(gltf, look) {
  const model = gltf.scene.clone(true);
  model.rotation.y = -Math.PI / 2; // the model faces +x; make the robot face +z

  // Each robot gets its own copy of every material so it can be tinted and glitched alone.
  const copies = new Map();
  const materials = {};
  model.traverse((mesh) => {
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    if (!copies.has(mesh.material)) {
      const copy = mesh.material.clone();
      if (copy.name === 'Metal' && look.color != null) {
        // The metal texture is dark, so over-brighten the tint to keep it colourful.
        copy.color.set(look.color).multiplyScalar(3);
        copy.metalness = 0.3;
      }
      copies.set(mesh.material, copy);
      materials[copy.name] = copy;
    }
    mesh.material = copies.get(mesh.material);
  });

  const head = model.getObjectByName('android_head');
  const eyes = model.getObjectByName('eyes');
  eyes.morphTargetInfluences.fill(0); // the export has every expression at 1; start neutral
  const feet = [model.getObjectByName('foot'), model.getObjectByName('foot001')];

  let spin = null;
  if (look.accessory) {
    const accessory = ACCESSORIES[look.accessory](look.color);
    accessory.group.position.copy(HEAD_CENTER);
    head.add(accessory.group);
    spin = accessory.spin ?? null;
  }

  const root = new THREE.Group();
  root.add(model);
  return {
    root, // move and turn the whole robot with this
    model,
    head,
    feet,
    eyes,
    materials,
    spin,
    expression: null, // null (neutral), 'blink', 'angry', 'happy' or 'sus'
    rest: { head: head.position.clone(), feet: feet.map((foot) => foot.position.clone()) },
  };
}

// Puts the robot back in its standing pose. Call before posing it each frame.
export function resetPose(robot) {
  robot.model.position.y = 0;
  robot.head.position.copy(robot.rest.head);
  robot.head.rotation.set(0, 0, 0);
  robot.feet.forEach((foot, i) => {
    foot.position.copy(robot.rest.feet[i]);
    foot.rotation.set(0, 0, 0);
  });
}

// Eases the pose part of the way back to standing (amount 0 = leave it, 1 = standing).
// Used to stop an activity smoothly instead of snapping out of it.
export function relaxPose(robot, amount) {
  if (amount <= 0) return;
  const keep = 1 - amount;
  robot.model.position.y *= keep;
  robot.head.position.lerp(robot.rest.head, amount);
  robot.head.rotation.set(robot.head.rotation.x * keep, robot.head.rotation.y * keep, robot.head.rotation.z * keep);
  robot.feet.forEach((foot, i) => {
    foot.position.lerp(robot.rest.feet[i], amount);
    foot.rotation.set(foot.rotation.x * keep, foot.rotation.y * keep, foot.rotation.z * keep);
  });
}

// Moves the eyes toward robot.expression. Faces blend over a few frames,
// unless robot.snapFace is set (the glitching robot flickers instantly).
export function applyExpression(robot, delta) {
  const weights = robot.eyes.morphTargetInfluences;
  const blend = robot.snapFace ? 1 : 1 - Math.exp(-delta * 20);
  for (const [name, index] of Object.entries(robot.eyes.morphTargetDictionary)) {
    weights[index] += ((name === robot.expression ? 1 : 0) - weights[index]) * blend;
  }
}

// Unit vector pointing the way the robot faces.
export function facing(robot) {
  const angle = robot.root.rotation.y;
  return new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
}
