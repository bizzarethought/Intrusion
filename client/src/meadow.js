import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const HORIZON = 0xd3ecf5;
const SKY_MID = 0x8cc8ee;
const ZENITH = 0x3f8fdc;
const SUN_DIRECTION = new THREE.Vector3(8, 14, 6).normalize();

// Where a robot can sit.
export const SIT_ROCK = { x: -6.5, z: 1, height: 0.9 };
// Direction (angle around the centre) the wide camera shots come from.
// Trees, bushes and big rocks are kept out of this wedge so the view stays clear.
export const CAMERA_SIDE = 0.9;

// Small seeded random so the meadow looks the same on every load.
let seed = 7;
function rand() {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
}
const between = (min, max) => min + rand() * (max - min);

function smoothstep(min, max, x) {
  x = Math.min(1, Math.max(0, (x - min) / (max - min)));
  return x * x * (3 - 2 * x);
}

// Random point in a ring around the centre, as [x, z].
function randomSpot(minR, maxR) {
  const angle = rand() * Math.PI * 2;
  const r = Math.sqrt(minR * minR + rand() * (maxR * maxR - minR * minR));
  return [Math.cos(angle) * r, Math.sin(angle) * r];
}

// Like randomSpot, but never close in front of the wide camera.
function spotOffCamera(minR, maxR) {
  for (;;) {
    const [x, z] = randomSpot(minR, maxR);
    const off = Math.atan2(z, x) - CAMERA_SIDE;
    const offCentre = Math.abs(Math.atan2(Math.sin(off), Math.cos(off)));
    if (offCentre > 0.6 || Math.hypot(x, z) > 55) return [x, z];
  }
}

// Ground height: flat where the robots play, rolling hills further out.
function groundHeight(x, z) {
  const waves =
    (Math.sin(x * 0.05 + 1.3) * Math.cos(z * 0.045 - 0.7) +
      0.5 * Math.sin(x * 0.11 + z * 0.09 + 2.1) +
      0.25 * Math.sin(x * 0.23 - z * 0.19)) / 1.75;
  return smoothstep(42, 95, Math.hypot(x, z)) * (5 + 5 * waves);
}

// Ground colour: patches of lush, light and dry grass.
const LUSH = new THREE.Color(0x5d9c46);
const LIGHT = new THREE.Color(0x86bb5c);
const DRY = new THREE.Color(0xa3ab62);
function groundColor(x, z, out) {
  const patch = 0.5 + 0.5 * Math.sin(x * 0.19 + Math.sin(z * 0.13) * 2) * Math.cos(z * 0.17 + 1);
  const dryness = smoothstep(0.55, 0.95, 0.5 + 0.5 * Math.sin(x * 0.07 - 2) * Math.sin(z * 0.09 + x * 0.03));
  return out.copy(LUSH).lerp(LIGHT, patch).lerp(DRY, dryness * 0.6);
}

// An irregular blob (rocks, foliage, mountains): a sphere with bumps pushed in and out.
function lumpy(detail, bumpSeed, amount) {
  const geometry = new THREE.IcosahedronGeometry(1, detail);
  const positions = geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    v.fromBufferAttribute(positions, i);
    const bump =
      Math.sin(v.x * 3.1 + bumpSeed) * Math.sin(v.y * 2.7 + bumpSeed * 2) * Math.sin(v.z * 3.7 + bumpSeed * 3) +
      0.5 * Math.sin(v.x * 7 + v.y * 5 + bumpSeed);
    v.multiplyScalar(1 + amount * bump);
    positions.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals(); // faceted, since the faces don't share vertices
  return geometry;
}

// Draws many copies of one shape in a single batch.
// items: [{ x, y, z, sx, sy, sz, turn, tilt, color }]
function instanced(geometry, material, items, castShadow = false) {
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  items.forEach((item, i) => {
    dummy.position.set(item.x, item.y, item.z);
    dummy.rotation.set(item.tilt ?? 0, item.turn ?? 0, 0);
    dummy.scale.set(item.sx, item.sy, item.sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (item.color !== undefined) mesh.setColorAt(i, color.set(item.color));
  });
  mesh.castShadow = castShadow;
  mesh.receiveShadow = castShadow;
  return mesh;
}

function makeSky() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      horizon: { value: new THREE.Color(HORIZON) },
      middle: { value: new THREE.Color(SKY_MID) },
      zenith: { value: new THREE.Color(ZENITH) },
      sunDirection: { value: SUN_DIRECTION },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 horizon;
      uniform vec3 middle;
      uniform vec3 zenith;
      uniform vec3 sunDirection;
      varying vec3 vDir;
      void main() {
        vec3 dir = normalize(vDir);
        vec3 color = mix(horizon, middle, smoothstep(0.0, 0.25, dir.y));
        color = mix(color, zenith, smoothstep(0.2, 0.9, dir.y));
        // sun disc with a soft glow around it
        float sun = max(dot(dir, sunDirection), 0.0);
        color += vec3(1.0, 0.9, 0.7) * (pow(sun, 800.0) * 3.0 + pow(sun, 16.0) * 0.3);
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(450, 96, 48), material);
}

function makeGround() {
  const geometry = new THREE.PlaneGeometry(1000, 1000, 300, 300).rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    positions.setY(i, groundHeight(x, z));
    groundColor(x, z, color).toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  // Speckle the ground per pixel so bare patches still read as grass up close and far away.
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying vec2 vGround;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n vGround = position.xz;'
    );
    shader.fragmentShader = `
      varying vec2 vGround;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
    ` + shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      diffuseColor.rgb *= 0.84 + 0.32 * (noise(vGround * 1.7) * 0.5 + noise(vGround * 0.45) * 0.3 + noise(vGround * 0.12) * 0.2);`
    );
  };
  const ground = new THREE.Mesh(geometry, material);
  ground.receiveShadow = true;
  return ground;
}

// One grass blade: a tapered strip, dark at the base and bright at the tip.
function makeBlade(segments) {
  const blade = new THREE.PlaneGeometry(0.14, 1, 1, segments);
  blade.translate(0, 0.5, 0);
  const pos = blade.attributes.position;
  const shades = [];
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setX(i, pos.getX(i) * (1 - y * 0.9));
    pos.setZ(i, y * y * 0.15); // a slight forward curl
    const shade = 0.45 + y * 0.55;
    shades.push(shade, shade, shade);
  }
  blade.setAttribute('color', new THREE.Float32BufferAttribute(shades, 3));
  // Point every normal up so blades are lit evenly like the ground.
  blade.attributes.normal.array.fill(0);
  for (let i = 0; i < pos.count; i++) blade.attributes.normal.setY(i, 1);
  return blade;
}

function makeGrass(time) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      // wind: bend the tip, offset by where the blade stands
      float wave = sin(uTime * 1.6 + instanceMatrix[3].x * 0.6 + instanceMatrix[3].z * 0.4);
      transformed.x += wave * 0.18 * position.y * position.y;`
    );
  };

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  // count blades, each placed by spot() and sized by its distance from the middle.
  function field(blade, count, spot, widen) {
    const mesh = new THREE.InstancedMesh(blade, material, count);
    for (let i = 0; i < count; i++) {
      const [x, z] = spot();
      const dist = Math.hypot(x, z);
      // Short near the middle where the robots stand, tall further out.
      const height = 0.3 + Math.min(dist / 9, 1) * 0.9 + rand() * (0.3 + dist / 40);
      dummy.position.set(x, groundHeight(x, z), z);
      dummy.rotation.y = rand() * Math.PI;
      dummy.scale.set(1 + widen * dist, height, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      groundColor(x, z, color).offsetHSL(between(-0.02, 0.03), 0.05, between(0, 0.1));
      mesh.setColorAt(i, color);
    }
    return mesh;
  }

  const grass = new THREE.Group();
  grass.add(
    // Thick, detailed blades where the robots are.
    field(makeBlade(5), 26000, () => randomSpot(0, 20), 0),
    // Simpler blades, wider with distance, covering everything out to the hills. Denser close in.
    field(makeBlade(2), 42000, () => {
      const angle = rand() * Math.PI * 2;
      const r = 18 + 122 * rand() ** 1.6;
      return [Math.cos(angle) * r, Math.sin(angle) * r];
    }, 0.05)
  );
  return grass;
}

function makeFlowers() {
  // One flower head: five petals around a golden centre.
  const painted = (geometry, r, g, b) => {
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) colors.set([r, g, b], i);
    return geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  };
  const parts = [painted(new THREE.SphereGeometry(0.06, 10, 8).translate(0, 0.02, 0), 1, 0.75, 0.15)];
  for (let i = 0; i < 5; i++) {
    const petal = new THREE.SphereGeometry(0.09, 10, 5).scale(1, 0.25, 0.6).translate(0.12, 0, 0);
    parts.push(painted(petal.rotateY((i / 5) * Math.PI * 2), 1, 1, 1));
  }
  const head = mergeGeometries(parts);
  const stem = new THREE.CylinderGeometry(0.018, 0.022, 1, 6).translate(0, 0.5, 0);

  const petalColors = [0xffffff, 0xffe066, 0xff8fb3, 0xc79bff, 0xff6b5e, 0x8fd0ff];
  const stems = [];
  const heads = [];
  for (let i = 0; i < 700; i++) {
    const [x, z] = randomSpot(1.5, 70);
    const y = groundHeight(x, z);
    const height = between(0.5, 1.2);
    const size = between(0.9, 1.7);
    stems.push({ x, y, z, sx: 1, sy: height, sz: 1 });
    heads.push({
      x, y: y + height, z, sx: size, sy: size, sz: size,
      turn: rand() * Math.PI, tilt: between(-0.5, 0.5),
      color: petalColors[Math.floor(rand() * petalColors.length)],
    });
  }
  const flowers = new THREE.Group();
  flowers.add(
    instanced(stem, new THREE.MeshLambertMaterial({ color: 0x3f7a2e }), stems),
    instanced(head, new THREE.MeshLambertMaterial({ vertexColors: true }), heads)
  );
  return flowers;
}

function makeRocks() {
  const rocks = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true });
  const rockColors = [0x8b8f8a, 0x9a9488, 0x777c7e, 0x858a72]; // greys, one mossy

  // The sitting rock is a plain shape so its top is where SIT_ROCK says it is.
  const seat = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 4), material.clone());
  seat.material.color.set(0x8b8f8a);
  const seatHeight = SIT_ROCK.height / 1.3;
  seat.position.set(SIT_ROCK.x, seatHeight * 0.3, SIT_ROCK.z);
  seat.scale.set(1.6, seatHeight, 1.5);
  seat.castShadow = seat.receiveShadow = true;
  rocks.add(seat);

  // Three detailed rock shapes for rocks and boulders, two simpler ones for pebbles.
  const shapes = [[], [], []];
  const pebbles = [[], []];
  function addRock(x, z, size) {
    const squash = between(0.5, 0.9);
    const list = size < 0.6 ? pebbles[Math.floor(rand() * 2)] : shapes[Math.floor(rand() * 3)];
    list.push({
      x, y: groundHeight(x, z) + size * squash * 0.25, z,
      sx: size, sy: size * squash, sz: size * between(0.7, 1.2),
      turn: rand() * Math.PI, tilt: between(-0.3, 0.3),
      color: rockColors[Math.floor(rand() * rockColors.length)],
    });
  }
  for (let i = 0; i < 160; i++) addRock(...randomSpot(4, 90), between(0.12, 0.4)); // pebbles
  for (let i = 0; i < 55; i++) { // medium rocks, each with a few pebbles beside it
    const [x, z] = spotOffCamera(14, 110);
    addRock(x, z, between(0.7, 1.5));
    for (let j = 0; j < 3; j++) addRock(x + between(-2, 2), z + between(-2, 2), between(0.2, 0.5));
  }
  for (let i = 0; i < 22; i++) { // boulders
    const [x, z] = spotOffCamera(20, 130);
    addRock(x, z, between(2, 4));
    addRock(x + between(-4, 4), z + between(-4, 4), between(1, 1.8));
  }
  shapes.forEach((items, i) => rocks.add(instanced(lumpy(3, i * 5 + 1, 0.16), material, items)));
  pebbles.forEach((items, i) => rocks.add(instanced(lumpy(1, i * 3 + 2, 0.14), material, items)));
  return rocks;
}

function makeTrees() {
  const trunks = [];
  const leaves = [];
  const pines = [];
  const green = new THREE.Color();
  for (let i = 0; i < 130; i++) {
    const [x, z] = spotOffCamera(26, 170);
    const y = groundHeight(x, z);
    const size = between(1, 2.3);
    if (rand() < 0.35) {
      // Pine: three stacked cones.
      trunks.push({ x, y, z, sx: size * 0.6, sy: size * 0.7, sz: size * 0.6 });
      const color = green.setHSL(between(0.36, 0.42), 0.45, between(0.16, 0.22)).getHex();
      for (let j = 0; j < 3; j++) {
        const width = size * (1.8 - j * 0.45);
        pines.push({ x, y: y + size * (1.5 + j * 1.25), z, sx: width, sy: size * 1.9, sz: width, turn: rand() * 3, color });
      }
    } else {
      // Leafy tree: a big crown with two smaller clumps.
      trunks.push({ x, y, z, sx: size, sy: size, sz: size, turn: rand() * 3 });
      const color = green.setHSL(between(0.26, 0.35), 0.5, between(0.2, 0.3)).getHex();
      leaves.push({ x, y: y + size * 3.7, z, sx: size * 1.8, sy: size * 1.5, sz: size * 1.8, turn: rand() * 3, color });
      for (const side of [-1, 1]) {
        leaves.push({
          x: x + side * size * between(0.7, 1.1), y: y + size * between(2.7, 3.2), z: z + size * between(-0.8, 0.8),
          sx: size * 1.2, sy: size, sz: size * 1.2, turn: rand() * 3, color,
        });
      }
    }
  }
  for (let i = 0; i < 80; i++) { // bushes
    const [x, z] = spotOffCamera(16, 110);
    const y = groundHeight(x, z);
    const size = between(0.7, 1.4);
    const color = green.setHSL(between(0.27, 0.36), 0.5, between(0.18, 0.28)).getHex();
    leaves.push({ x, y: y + size * 0.4, z, sx: size * 1.3, sy: size * 0.8, sz: size, turn: rand() * 3, color });
    leaves.push({ x: x + size * 0.8, y: y + size * 0.3, z: z + size * 0.4, sx: size * 0.8, sy: size * 0.6, sz: size * 0.8, turn: rand() * 3, color });
  }

  const trees = new THREE.Group();
  trees.add(
    instanced(new THREE.CylinderGeometry(0.22, 0.38, 3, 16).translate(0, 1.5, 0), new THREE.MeshLambertMaterial({ color: 0x6b4a2f }), trunks),
    instanced(lumpy(3, 3, 0.12), new THREE.MeshLambertMaterial({ flatShading: true }), leaves),
    instanced(new THREE.ConeGeometry(1, 1, 28, 3), new THREE.MeshLambertMaterial({ flatShading: true }), pines)
  );
  return trees;
}

function makeMushrooms() {
  const caps = [];
  const stems = [];
  for (let i = 0; i < 14; i++) { // little clusters
    const [cx, cz] = randomSpot(5, 34);
    const color = rand() < 0.6 ? 0xd9412f : 0xd9a066;
    for (let j = 0; j < 3; j++) {
      const x = cx + between(-0.5, 0.5);
      const z = cz + between(-0.5, 0.5);
      const size = between(0.7, 1.5);
      stems.push({ x, y: 0, z, sx: size, sy: size, sz: size });
      caps.push({ x, y: 0.2 * size, z, sx: size, sy: size, sz: size, color });
    }
  }
  const mushrooms = new THREE.Group();
  mushrooms.add(
    instanced(new THREE.CylinderGeometry(0.05, 0.065, 0.22, 16).translate(0, 0.11, 0), new THREE.MeshLambertMaterial({ color: 0xf2e9d8 }), stems),
    instanced(new THREE.SphereGeometry(0.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial(), caps)
  );
  return mushrooms;
}

function makeMountains() {
  const peaks = [];
  for (let i = 0; i < 20; i++) {
    const angle = (i / 20) * Math.PI * 2 + between(-0.1, 0.1);
    const distance = between(190, 240);
    const width = between(50, 95);
    peaks.push({
      x: Math.cos(angle) * distance, y: -8, z: Math.sin(angle) * distance,
      sx: width, sy: between(35, 70), sz: width, turn: rand() * 3,
      color: rand() < 0.5 ? 0x6f9bb0 : 0x7fa9a8,
    });
  }
  return instanced(lumpy(4, 11, 0.2), new THREE.MeshLambertMaterial({ flatShading: true }), peaks);
}

function makeClouds() {
  const puffs = [];
  for (let i = 0; i < 18; i++) {
    const [x, z] = randomSpot(10, 260);
    const y = between(45, 80);
    for (let j = 0; j < 7; j++) {
      const size = between(4, 9);
      puffs.push({
        x: x + (j - 3) * size * 0.9, y: y + between(0, 2.5) + (j % 2) * size * 0.3, z: z + between(-4, 4),
        sx: size * 1.5, sy: size * 0.75, sz: size * 1.1,
      });
    }
  }
  const geometry = mergeVertices(new THREE.IcosahedronGeometry(1, 3).deleteAttribute('uv').deleteAttribute('normal'));
  geometry.computeVertexNormals(); // shared vertices, so the puffs shade smoothly
  // Lit from above, with a little glow so the undersides stay soft.
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x9fb4c8, emissiveIntensity: 0.55, fog: false });
  return instanced(geometry, material, puffs);
}

// Adds the whole meadow to the scene. Call update(seconds) every frame.
export function createMeadow(scene) {
  const time = { value: 0 };
  const clouds = makeClouds();
  scene.fog = new THREE.Fog(HORIZON, 60, 300);
  scene.add(
    makeSky(), makeGround(), makeGrass(time), makeFlowers(), makeRocks(),
    makeTrees(), makeMushrooms(), makeMountains(), clouds
  );

  scene.add(new THREE.HemisphereLight(0xe6f4ff, 0x5c8a45, 1.7));
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.2);
  sun.position.copy(SUN_DIRECTION).multiplyScalar(30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const cam = sun.shadow.camera;
  cam.left = cam.bottom = -18;
  cam.right = cam.top = 18;
  cam.far = 70;
  scene.add(sun);

  return {
    update(seconds) {
      time.value = seconds;
      clouds.rotation.y = seconds * 0.004; // slow drift
    },
  };
}
