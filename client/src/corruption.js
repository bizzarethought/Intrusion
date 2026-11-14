import * as THREE from 'three';
import { HEAD_CENTER } from './robots.js';

const GLITCH_COLORS = ['#ff2a2a', '#7a0000', '#ffffff', '#00e5ff', '#000000'];
const FACES = ['angry', 'sus', 'blink', 'happy', null];
const CORRUPT_RED = 0xff1a1a;

// 0 below 0, 1 above 1, eased in between.
function smooth(x) {
  x = Math.min(1, Math.max(0, x));
  return x * x * (3 - 2 * x);
}
const jitter = (amount) => (Math.random() - 0.5) * 2 * amount;

// The AI taking over one robot: it drops to its knees, its screen fills with
// static, its face flickers, and sparks and electric arcs fly off it.
// Call update(seconds since the corruption started, delta) every frame.
export function createCorruption(robot, group) {
  // Screen static: a tiny canvas redrawn every frame, shown on a disc over the screen.
  const SIZE = 24;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  const screenStatic = new THREE.Mesh(
    new THREE.CircleGeometry(0.8, 64),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })
  );
  screenStatic.position.set(0.62, 0, HEAD_CENTER.z);
  screenStatic.rotation.y = Math.PI / 2;
  robot.head.add(screenStatic);

  function drawStatic() {
    ctx.clearRect(0, 0, SIZE, SIZE);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (Math.random() < 0.5) continue; // gaps let the eyes show through
        ctx.fillStyle = GLITCH_COLORS[Math.floor(Math.random() * GLITCH_COLORS.length)];
        ctx.fillRect(x, y, 1, 1);
      }
    }
    for (let i = 0; i < 2; i++) { // torn horizontal bands
      ctx.fillStyle = Math.random() < 0.5 ? '#ff2a2a' : '#00e5ff';
      ctx.fillRect(0, Math.floor(Math.random() * SIZE), SIZE, 1 + Math.floor(Math.random() * 2));
    }
    texture.needsUpdate = true;
  }

  // Sparks: a fixed pool of points, parked under the ground when not in use.
  const SPARKS = 48;
  const sparkPositions = new THREE.BufferAttribute(new Float32Array(SPARKS * 3).fill(-100), 3);
  const sparks = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', sparkPositions),
    new THREE.PointsMaterial({
      color: 0xffe9a0, size: 0.16, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    })
  );
  sparks.frustumCulled = false;
  group.add(sparks);
  const sparkVelocity = Array.from({ length: SPARKS }, () => new THREE.Vector3());
  const origin = new THREE.Vector3();
  let nextSpark = 0;

  function emitSparks() {
    robot.head.getWorldPosition(origin);
    for (let n = 0; n < 5; n++) {
      const i = nextSpark++ % SPARKS;
      sparkPositions.setXYZ(i, origin.x, origin.y, origin.z);
      sparkVelocity[i].set(jitter(3), 2 + Math.random() * 3, jitter(3));
    }
  }

  function moveSparks(delta) {
    for (let i = 0; i < SPARKS; i++) {
      if (sparkPositions.getY(i) < 0) continue; // parked
      sparkVelocity[i].y -= 12 * delta;
      const y = sparkPositions.getY(i) + sparkVelocity[i].y * delta;
      sparkPositions.setXYZ(
        i,
        sparkPositions.getX(i) + sparkVelocity[i].x * delta,
        y < 0 ? -100 : y,
        sparkPositions.getZ(i) + sparkVelocity[i].z * delta
      );
    }
    sparkPositions.needsUpdate = true;
  }

  // Electric arcs: jagged lines crawling over the head, redrawn every frame.
  const arcMaterial = new THREE.LineBasicMaterial({ color: 0x9fe8ff, toneMapped: false });
  const arcs = [0, 1, 2].map(() => {
    const points = Array.from({ length: 7 }, () => new THREE.Vector3());
    const arc = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), arcMaterial);
    arc.position.copy(HEAD_CENTER);
    arc.frustumCulled = false;
    arc.visible = false;
    robot.head.add(arc);
    return arc;
  });
  const arcPoint = new THREE.Vector3();

  function redrawArc(arc) {
    const positions = arc.geometry.attributes.position;
    arcPoint.randomDirection();
    for (let i = 0; i < positions.count; i++) {
      arcPoint.x += jitter(0.5);
      arcPoint.y += jitter(0.5);
      arcPoint.z += jitter(0.5);
      arcPoint.setLength(1.3 + Math.random() * 0.15);
      positions.setXYZ(i, arcPoint.x, arcPoint.y, arcPoint.z);
    }
    positions.needsUpdate = true;
  }

  // A flickering light so the sparks light up the grass and other robots.
  const flash = new THREE.PointLight(0x8fdcff, 0, 10);
  flash.position.copy(HEAD_CENTER);
  flash.position.x += 1.5;
  robot.head.add(flash);

  const eyeColor = robot.materials.eyes.emissive.clone();
  let face = 'sus';
  let faceTimer = 0;

  return {
    update(seconds, delta) {
      const kneel = smooth(seconds / 0.35);
      const rise = smooth((seconds - 3.7) / 1.5); // lifts its head again, now corrupted
      const settled = seconds > 3.2;
      // How strong the glitch is: ramps up, holds, then eases to a low simmer.
      const glitch = smooth((seconds - 0.2) / 0.8) * (1 - 0.65 * smooth((seconds - 3.2) / 1.3));

      // Kneel: the head slumps to the ground and the feet tuck behind it.
      const { head, feet } = robot;
      head.position.y -= 0.6 * kneel;
      head.position.x += 0.2 * kneel;
      head.rotation.z = (-0.45 + 0.5 * rise) * kneel;
      feet.forEach((foot, i) => {
        foot.position.x -= 1.3 * kneel;
        foot.position.z += (i ? -0.15 : 0.15) * kneel;
        foot.rotation.z = 0.9 * kneel;
      });

      // Twitching.
      head.position.x += jitter(0.05 * glitch);
      head.position.z += jitter(0.05 * glitch);
      head.rotation.x = jitter(0.12 * glitch);
      if (Math.random() < 0.06 * glitch) head.rotation.y = jitter(0.6);

      // Face: flickers through expressions, then locks on angry and red.
      faceTimer -= delta;
      if (faceTimer <= 0) {
        faceTimer = 0.07 + Math.random() * 0.1;
        face = settled ? 'angry' : FACES[Math.floor(Math.random() * FACES.length)];
      }
      robot.expression = seconds < 0.2 ? 'sus' : face;
      robot.snapFace = seconds >= 0.2; // flicker, don't blend
      const red = glitch > 0 && (settled || Math.random() < 0.7);
      robot.materials.eyes.emissive.set(red ? CORRUPT_RED : eyeColor);

      // Static, arcs, sparks and light.
      screenStatic.material.opacity = glitch * (Math.random() < 0.12 ? 0.25 : 0.95);
      if (glitch > 0) drawStatic();
      arcs.forEach((arc) => {
        arc.visible = glitch > 0.5 && Math.random() < 0.6;
        if (arc.visible) redrawArc(arc);
      });
      if (Math.random() < 0.35 * glitch) emitSparks();
      moveSparks(delta);
      flash.intensity = glitch > 0.3 ? Math.random() * 8 * glitch : 0;
    },
  };
}
