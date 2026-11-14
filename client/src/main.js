import * as THREE from 'three';
import { createMeadow } from './meadow.js';
import { loadRobotModel } from './robots.js';
import { createShow } from './show.js';

// One entry per robot in the lobby. In the real game this list is
// players + 1 (the AI), each with a random colour and accessory.
const LOBBY = [
  { color: null, accessory: null },
  { color: 0xc0271a, accessory: 'horns' },
  { color: 0x2f6fd0, accessory: 'headphones' },
  { color: 0x7fb020, accessory: 'propellerCap' },
  { color: 0xd9a400, accessory: 'crown' },
];

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); // cap for ordinary laptops
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
const meadow = createMeadow(scene);

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// For reviewing: open /?t=19 to jump straight to that second of the sequence.
const startAt = Number(new URLSearchParams(location.search).get('t')) || 0;

// For checking performance: open /?stats to see frames per second and triangles drawn.
let stats = null;
if (new URLSearchParams(location.search).has('stats')) {
  const box = document.body.appendChild(document.createElement('div'));
  box.style.cssText = 'position:fixed;left:8px;top:8px;padding:4px 8px;background:#000a;color:#fff;font:12px monospace';
  let frames = 0;
  let seconds = 0;
  stats = {
    frame(delta) {
      frames++;
      seconds += delta;
      if (seconds < 0.5) return;
      box.textContent = `${Math.round(frames / seconds)} fps, ${renderer.info.render.triangles.toLocaleString()} triangles`;
      frames = seconds = 0;
    },
  };
}

loadRobotModel().then((gltf) => {
  let show = createShow(scene, camera, gltf, LOBBY, startAt);

  // Called when the sequence ends. The demo loops; the real game
  // would switch to the match here instead.
  function onShowDone() {
    show.dispose();
    show = createShow(scene, camera, gltf, LOBBY);
  }

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const delta = Math.min(clock.getDelta(), 0.5); // don't leap ahead after a paused tab
    meadow.update(clock.elapsedTime);
    if (show.update(delta)) onShowDone();
    renderer.render(scene, camera);
    stats?.frame(delta);
  });
});
