import * as THREE from 'three';

/* ═══════════════════════════════════════════════════════
   Voxel Dispatch World
   明亮治愈方块世界 + 公平网约车治理玩法
   徒步探索 / 驾驶出租车 / 接送 NPC 赚金币 / 可审计派单
   ═══════════════════════════════════════════════════════ */

// ──────────────────────────────────────────────
// Config & palette
// ──────────────────────────────────────────────

const SIZE = 48;
const SEA = 6;
const MAX_OPAQUE = 150000;
const MAX_WATER = 20000;
const MAX_DECO = 12000;

const C = {
  grass: 0x7ec85a, dirt: 0x9b7653, stone: 0x8e9aa2, sand: 0xecd98a,
  snow: 0xf4faff, ice: 0xa9dcff, water: 0x3b8fd6,
  oakWood: 0x6e5230, oakLeaves: 0x5fa83a,
  birchWood: 0xd8cdb6, birchLeaves: 0x8fcf5a,
  spruceWood: 0x4a3522, spruceLeaves: 0x2f6b3a,
  palmWood: 0xc39a5e, palmLeaves: 0x4fae5a, cactus: 0x3a9d4a,
  flowerRed: 0xe54848, flowerWhite: 0xf5f5f5, flowerYellow: 0xf4d03f,
  tuft: 0x6fb04a, cloud: 0xffffff,
  log: 0x7a5a32, planks: 0xc39a5e, glass: 0xbfe3ef, roof: 0x8a5a3a,
  taxiBody: 0xffd23f, taxiWindow: 0xbfe3ef, taxiWheel: 0x2b2b2b, taxiLight: 0xfff4c2,
  skin: 0xf0c8a0, hair: 0x3a2a1a,
};

const SHIRT = [0xef6f6f, 0x4ea3e8, 0xf5c542];

// ──────────────────────────────────────────────
// Renderer / scene / camera
// ──────────────────────────────────────────────

const scene = new THREE.Scene();
scene.background = makeSkyTexture();
scene.fog = new THREE.Fog(0xcdeeff, 38, 135);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 240);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('stage').appendChild(renderer.domElement);

// ──────────────────────────────────────────────
// Lights — soft warm daylight, global fill
// ──────────────────────────────────────────────

scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x6a7a4a, 0.95));
scene.add(new THREE.AmbientLight(0xffffff, 0.35));
const sun = new THREE.DirectionalLight(0xfff2d0, 0.85);
sun.position.set(40, 70, 30);
scene.add(sun);

function makeSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#3f8fd6');
  g.addColorStop(0.45, '#7fbcf0');
  g.addColorStop(0.8, '#bfe3f5');
  g.addColorStop(1, '#dff3ff');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ──────────────────────────────────────────────
// Perlin noise (seeded)
// ──────────────────────────────────────────────

function makePerlin(seed) {
  const p = new Uint8Array(512);
  const perm = Array.from({ length: 256 }, (_, i) => i);
  let s = seed >>> 0;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 255; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 512; i += 1) p[i] = perm[i & 255];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + t * (b - a);
  const grad = (h, x, y) => (h & 1 ? x : -x) + (h & 2 ? y : -y);
  return (x, y) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = fade(xf), v = fade(yf);
    const aa = p[p[X] + Y], ab = p[p[X] + Y + 1], ba = p[p[X + 1] + Y], bb = p[p[X + 1] + Y + 1];
    return lerp(lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
                lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u), v);
  };
}

const noiseE = makePerlin(20260617);
const noiseT = makePerlin(777);
const noiseM = makePerlin(4242);

function fbm(n, x, y, oct = 4) {
  let e = 0, amp = 1, freq = 1, sum = 0;
  for (let i = 0; i < oct; i += 1) {
    e += amp * n(x * freq, y * freq);
    sum += amp; amp *= 0.5; freq *= 2;
  }
  return e / sum;
}

// ──────────────────────────────────────────────
// Voxel storage + instanced meshes
// ──────────────────────────────────────────────

const blocks = new Map();
const keyOf = (x, y, z) => `${x},${y},${z}`;
const cell = (v) => Math.floor(v + 0.5);
const heightMap = new Map();
const biomeMap = new Map();
const landCols = [];

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const opaqueMesh = new THREE.InstancedMesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX_OPAQUE);
opaqueMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
opaqueMesh.count = 0;
scene.add(opaqueMesh);

const waterMesh = new THREE.InstancedMesh(
  boxGeo,
  new THREE.MeshLambertMaterial({ color: C.water, transparent: true, opacity: 0.72 }),
  MAX_WATER,
);
waterMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
waterMesh.count = 0;
scene.add(waterMesh);

const decoGeo = new THREE.BoxGeometry(1, 1, 1);
const decoMesh = new THREE.InstancedMesh(decoGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX_DECO);
decoMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
decoMesh.count = 0;
scene.add(decoMesh);

const opaqueKeys = [], waterKeys = [], decoData = [];
const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();

function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177) >>> 0;
  h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
  return h;
}
function jitterColor(hex, x, y, z) {
  const f = 0.95 + (hash3(x, y, z) % 1000) / 1000 * 0.1;
  return tmpColor.setHex(hex).multiplyScalar(f);
}

function rebuildInstances() {
  let oi = 0, wi = 0;
  opaqueKeys.length = 0; waterKeys.length = 0;
  for (const [k, b] of blocks) {
    if (b.water) {
      if (wi >= MAX_WATER) continue;
      const [x, y, z] = k.split(',').map(Number);
      dummy.position.set(x, y, z); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      waterMesh.setMatrixAt(wi, dummy.matrix);
      waterKeys[wi] = k; wi += 1;
    } else {
      if (oi >= MAX_OPAQUE) continue;
      const [x, y, z] = k.split(',').map(Number);
      dummy.position.set(x, y, z); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      opaqueMesh.setMatrixAt(oi, dummy.matrix);
      opaqueMesh.setColorAt(oi, jitterColor(b.color, x, y, z));
      opaqueKeys[oi] = k; oi += 1;
    }
  }
  opaqueMesh.count = oi; opaqueMesh.instanceMatrix.needsUpdate = true;
  if (opaqueMesh.instanceColor) opaqueMesh.instanceColor.needsUpdate = true;
  waterMesh.count = wi; waterMesh.instanceMatrix.needsUpdate = true;
}

function rebuildDeco() {
  for (let i = 0; i < decoData.length; i += 1) {
    const d = decoData[i];
    dummy.position.set(d.x, d.y, d.z); dummy.scale.set(d.s, d.s, d.s); dummy.updateMatrix();
    decoMesh.setMatrixAt(i, dummy.matrix);
    decoMesh.setColorAt(i, tmpColor.setHex(d.color));
  }
  decoMesh.count = decoData.length; decoMesh.instanceMatrix.needsUpdate = true;
  if (decoMesh.instanceColor) decoMesh.instanceColor.needsUpdate = true;
}

function setBlock(x, y, z, color, water = false) {
  blocks.set(keyOf(x, y, z), { color, water });
}
function delBlock(x, y, z) { blocks.delete(keyOf(x, y, z)); }
function isSolid(x, y, z) { return blocks.has(keyOf(x, y, z)) && !blocks.get(keyOf(x, y, z)).water; }
function isWater(x, y, z) { const b = blocks.get(keyOf(x, y, z)); return b && b.water; }
function heightAt(x, z) { return heightMap.get(`${cell(x)},${cell(z)}`) ?? SEA; }

// ──────────────────────────────────────────────
// World generation
// ──────────────────────────────────────────────

function biomeAt(x, z, h) {
  const t = (fbm(noiseT, x * 0.02 + 50, z * 0.02 + 50) + 1) / 2;
  const m = (fbm(noiseM, x * 0.02 - 30, z * 0.02 - 30) + 1) / 2;
  if (h >= 17) return h >= 20 ? 'snowPeak' : 'mountain';
  if (t > 0.62 && m < 0.42) return 'desert';
  if (t < 0.38) return 'snow';
  if (m > 0.55) return 'forest';
  return 'plains';
}

function generateWorld() {
  blocks.clear(); heightMap.clear(); biomeMap.clear(); landCols.length = 0; decoData.length = 0;
  const cx0 = -Math.floor(SIZE / 2);
  for (let i = 0; i < SIZE; i += 1) {
    for (let j = 0; j < SIZE; j += 1) {
      const x = cx0 + i, z = cx0 + j;
      let e = (fbm(noiseE, x * 0.016 + 100, z * 0.016 + 100) + 1) / 2;
      let h = Math.floor(2 + e * 20);
      const b = biomeAt(x, z, h);
      if (b === 'desert') h = Math.min(h, 9);
      if (b === 'plains') h = Math.min(h, 10);
      const topSolidY = h;
      heightMap.set(`${x},${z}`, topSolidY);
      biomeMap.set(`${x},${z}`, b);

      const underwater = h < SEA;
      for (let y = 0; y <= h; y += 1) {
        let col;
        if (y === h) {
          if (b === 'desert') col = C.sand;
          else if (b === 'snow' || b === 'snowPeak') col = underwater ? C.dirt : C.snow;
          else if (b === 'mountain') col = C.stone;
          else col = underwater ? C.sand : C.grass;
        } else if (y > h - 3) {
          if (b === 'desert') col = C.sand;
          else if (b === 'mountain') col = C.stone;
          else col = C.dirt;
        } else col = C.stone;
        setBlock(x, y, z, col);
      }
      if (b === 'snowPeak' && h >= 20) setBlock(x, h, z, C.snow);
      if (underwater) {
        for (let y = h + 1; y <= SEA; y += 1) {
          setBlock(x, y, z, C.water, true);
          if (b === 'snow' && y === SEA) { delBlock(x, y, z); setBlock(x, y, z, C.ice); }
        }
      } else {
        landCols.push({ x, z, y: topSolidY, biome: b });
      }
    }
  }
  decorate();
  buildCabin();
  rebuildInstances();
  rebuildDeco();
}

function decorate() {
  const cx0 = -Math.floor(SIZE / 2);
  for (let i = 0; i < SIZE; i += 1) {
    for (let j = 0; j < SIZE; j += 1) {
      const x = cx0 + i, z = cx0 + j;
      const b = biomeMap.get(`${x},${z}`);
      const y = heightMap.get(`${x},${z}`);
      if (y <= SEA) continue;
      const r = hash3(x, 1, z) % 1000;
      if (b === 'plains') {
        if (r < 6) plantOak(x, y, z);
        else if (r < 10) plantBirch(x, y, z);
        else if (r < 60) addFlower(x, y, z, r);
      } else if (b === 'forest') {
        if (r < 38) (r % 3 === 0 ? plantSpruce(x, y, z) : r % 3 === 1 ? plantOak(x, y, z) : plantBirch(x, y, z));
        else if (r < 80) addFlower(x, y, z, r);
      } else if (b === 'snow' || b === 'snowPeak') {
        if (b === 'snow' && r < 22) plantSpruce(x, y, z);
      } else if (b === 'desert') {
        if (r < 10) plantCactus(x, y, z);
        else if (r < 14) plantPalm(x, y, z);
      } else if (b === 'mountain') {
        if (r < 3) plantSpruce(x, y, z);
      }
    }
  }
}

function addFlower(x, y, z, r) {
  const col = r % 3 === 0 ? C.flowerRed : r % 3 === 1 ? C.flowerYellow : C.flowerWhite;
  decoData.push({ x, y: y + 0.65, z, s: 0.3, color: col });
}
function decoCube(x, y, z, s, color) { decoData.push({ x, y, z, s, color }); }

function plantOak(x, y, z) {
  const h = 4 + (hash3(x, y, z) % 3);
  for (let i = 1; i <= h; i += 1) setBlock(x, y + i, z, C.oakWood);
  canopy(x, y + h, z, C.oakLeaves, 2);
}
function plantBirch(x, y, z) {
  const h = 5 + (hash3(x, y, z) % 3);
  for (let i = 1; i <= h; i += 1) setBlock(x, y + i, z, C.birchWood);
  canopy(x, y + h, z, C.birchLeaves, 2);
}
function plantSpruce(x, y, z) {
  const h = 6 + (hash3(x, y, z) % 4);
  for (let i = 1; i <= h; i += 1) setBlock(x, y + i, z, C.spruceWood);
  for (let ly = h - 2; ly <= h + 1; ly += 1) {
    const r = ly < h ? 2 : 1;
    for (let dx = -r; dx <= r; dx += 1)
      for (let dz = -r; dz <= r; dz += 1)
        if (Math.abs(dx) + Math.abs(dz) <= r + 1 && !blocks.has(keyOf(x + dx, y + ly, z + dz)))
          setBlock(x + dx, y + ly, z + dz, C.spruceLeaves);
  }
}
function plantCactus(x, y, z) {
  const h = 1 + (hash3(x, y, z) % 3);
  for (let i = 1; i <= h; i += 1) setBlock(x, y + i, z, C.cactus);
}
function plantPalm(x, y, z) {
  const h = 4;
  for (let i = 1; i <= h; i += 1) setBlock(x, y + i, z, C.palmWood);
  const top = y + h;
  for (const [dx, dz] of [[-2, 0], [2, 0], [0, -2], [0, 2], [0, 0]]) {
    if (!blocks.has(keyOf(x + dx, top + 1, z + dz))) setBlock(x + dx, top + 1, z + dz, C.palmLeaves);
  }
}
function canopy(x, topY, z, leaf, r) {
  for (let dx = -r; dx <= r; dx += 1)
    for (let dy = 0; dy <= 1; dy += 1)
      for (let dz = -r; dz <= r; dz += 1) {
        if (Math.abs(dx) === r && Math.abs(dz) === r && dy === 0) continue;
        if (!blocks.has(keyOf(x + dx, topY + dy, z + dz)))
          setBlock(x + dx, topY + dy, z + dz, leaf);
      }
  if (!blocks.has(keyOf(x, topY + 2, z))) setBlock(x, topY + 2, z, leaf);
}

// ──────────────────────────────────────────────
// Cabin at spawn
// ──────────────────────────────────────────────

let spawnPoint = { x: 0, z: 0, y: SEA };
let taxiSpawn = { x: 0, z: 0, y: SEA };

function findSpawn() {
  const cx0 = -Math.floor(SIZE / 2);
  for (let r = 0; r < SIZE; r += 1) {
    for (let i = -r; i <= r; i += 1) {
      for (const [x, z] of [[i, -r], [i, r], [-r, i], [r, i]]) {
        const wx = cx0 + Math.floor(SIZE / 2) + x;
        const wz = cx0 + Math.floor(SIZE / 2) + z;
        if (biomeMap.get(`${wx},${wz}`) === 'plains') {
          const y = heightMap.get(`${wx},${wz}`);
          if (y > SEA) return { x: wx, z: wz, y };
        }
      }
    }
  }
  return { x: 0, z: 0, y: heightMap.get('0,0') ?? SEA + 2 };
}

function buildCabin() {
  spawnPoint = findSpawn();
  const { x: sx, z: sz, y: sy } = spawnPoint;
  // flatten a 9x7 pad
  for (let dx = -4; dx <= 4; dx += 1)
    for (let dz = -3; dz <= 3; dz += 1)
      for (let yy = sy + 1; yy <= sy + 1; yy += 1) delBlock(sx + dx, yy, sz + dz);
  const bx = sx, bz = sz, by = sy;
  const W = 7, D = 5;
  const x0 = bx - Math.floor(W / 2), z0 = bz - Math.floor(D / 2);
  for (let dx = 0; dx < W; dx += 1) {
    for (let dz = 0; dz < D; dz += 1) {
      const wall = dx === 0 || dx === W - 1 || dz === 0 || dz === D - 1;
      for (let dy = 1; dy <= 3; dy += 1) {
        if (!wall) continue;
        const corner = (dx === 0 || dx === W - 1) && (dz === 0 || dz === D - 1);
        const isDoor = (dx === 3 && dz === 0 && dy <= 2);
        const isWindow = ((dx === 0 || dx === W - 1) && dz === 2 && dy === 2) || (dz === 0 && dx === 1 && dy === 2);
        if (isDoor) continue;
        setBlock(x0 + dx, by + dy, z0 + dz, isWindow ? C.glass : (corner ? C.log : C.planks));
      }
    }
  }
  // roof
  for (let dx = -1; dx < W + 1; dx += 1)
    for (let dz = -1; dz < D + 1; dz += 1)
      setBlock(x0 + dx, by + 4, z0 + dz, C.roof);
  // warm light inside
  decoCube(bx, by + 2, bz, 0.5, 0xffe39a);
  taxiSpawn = { x: bx + 4, z: bz + 1, y: heightMap.get(`${bx + 4},${bz + 1}`) ?? by };
}

// ──────────────────────────────────────────────
// Clouds
// ──────────────────────────────────────────────

const clouds = [];
(function makeClouds() {
  const mat = new THREE.MeshLambertMaterial({ color: C.cloud, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 7; i += 1) {
    const g = new THREE.Group();
    const n = 4 + Math.floor(Math.random() * 5);
    for (let k = 0; k < n; k += 1) {
      const m = new THREE.Mesh(boxGeo, mat);
      m.position.set((Math.random() - 0.5) * 6, Math.random() * 1.2, (Math.random() - 0.5) * 5);
      m.scale.setScalar(1.6 + Math.random() * 1.4);
      g.add(m);
    }
    g.position.set((Math.random() - 0.5) * 80, 28 + Math.random() * 6, (Math.random() - 0.5) * 80);
    g.userData.speed = 0.3 + Math.random() * 0.4;
    scene.add(g);
    clouds.push(g);
  }
})();

// ──────────────────────────────────────────────
// Player (foot mode)
// ──────────────────────────────────────────────

const player = {
  pos: new THREE.Vector3(0, SEA + 4, 0),
  vel: new THREE.Vector3(),
  yaw: 0, pitch: 0,
  onGround: false,
  height: 1.7, radius: 0.3, eye: 1.6,
};
const keys = {};
let locked = false;
let started = false;
let mode = 'foot'; // 'foot' | 'drive'

function collidesAt(px, py, pz) {
  const r = player.radius, h = player.height;
  const x0 = cell(px - r), x1 = cell(px + r);
  const y0 = cell(py), y1 = cell(py + h - 0.001);
  const z0 = cell(pz - r), z1 = cell(pz + r);
  for (let x = x0; x <= x1; x += 1)
    for (let y = y0; y <= y1; y += 1)
      for (let z = z0; z <= z1; z += 1)
        if (isSolid(x, y, z)) return true;
  return false;
}
function footInWater() {
  return isWater(cell(player.pos.x), cell(player.pos.y + 0.4), cell(player.pos.z));
}

function moveAxis(dx, dy, dz) {
  const nx = player.pos.x + dx, ny = player.pos.y + dy, nz = player.pos.z + dz;
  if (collidesAt(nx, ny, nz)) return false;
  player.pos.set(nx, ny, nz);
  return true;
}

function updateFoot(dt) {
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  if (locked) {
    const fwd = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    const move = new THREE.Vector3();
    if (keys['KeyW']) move.add(fwd);
    if (keys['KeyS']) move.sub(fwd);
    if (keys['KeyD']) move.add(right);
    if (keys['KeyA']) move.sub(right);
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(footInWater() ? 3 : 5);
    const inWater = footInWater();
    player.vel.y -= (inWater ? 6 : 25) * dt;
    if (inWater) player.vel.y = Math.max(player.vel.y, -2);
    if (player.onGround && keys['Space']) { player.vel.y = inWater ? 4 : 8; player.onGround = false; }
    if (inWater && keys['Space']) player.vel.y = 3;

    moveAxis(move.x * dt, 0, 0);
    moveAxis(0, 0, move.z * dt);
    const falling = player.vel.y < 0;
    if (!moveAxis(0, player.vel.y * dt, 0)) {
      if (falling) player.onGround = true;
      player.vel.y = 0;
    } else player.onGround = false;

    if (player.pos.y < -20) { player.pos.set(spawnPoint.x + 0.5, spawnPoint.y + 3, spawnPoint.z + 0.5); player.vel.set(0, 0, 0); }
  }
  camera.position.set(player.pos.x, player.pos.y + player.eye, player.pos.z);
}

// ──────────────────────────────────────────────
// Block place / break
// ──────────────────────────────────────────────

const ray = new THREE.Raycaster();
const center = new THREE.Vector2(0, 0);
function overlapsPlayer(bx, by, bz) {
  const r = player.radius, h = player.height;
  return Math.abs(player.pos.x - bx) < 0.5 + r && player.pos.y < by + 0.5 && player.pos.y + h > by - 0.5 && Math.abs(player.pos.z - bz) < 0.5 + r;
}
function handleBlockAction(e) {
  if (mode !== 'foot' || !locked) return;
  ray.setFromCamera(center, camera);
  const hit = ray.intersectObject(opaqueMesh)[0];
  if (!hit || hit.instanceId === undefined) return;
  const k = opaqueKeys[hit.instanceId]; if (!k) return;
  const [bx, by, bz] = k.split(',').map(Number);
  const n = hit.face.normal;
  if (e.button === 0) { delBlock(bx, by, bz); rebuildInstances(); gov.broken += 1; }
  else if (e.button === 2) {
    const nx = bx + Math.round(n.x), ny = by + Math.round(n.y), nz = bz + Math.round(n.z);
    if (!blocks.has(keyOf(nx, ny, nz)) && !overlapsPlayer(nx, ny, nz)) {
      setBlock(nx, ny, nz, C.planks); rebuildInstances(); gov.placed += 1;
    }
  }
}

// ──────────────────────────────────────────────
// Taxi (player-driven)
// ──────────────────────────────────────────────

const taxi = {
  pos: new THREE.Vector3(),
  heading: 0,
  speed: 0,
  mesh: new THREE.Group(),
};
function buildTaxiMesh() {
  const g = taxi.mesh;
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 2.8), new THREE.MeshLambertMaterial({ color: C.taxiBody }));
  body.position.y = 0.55;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.6, 1.4), new THREE.MeshLambertMaterial({ color: C.taxiBody }));
  cabin.position.set(0, 1.1, -0.1);
  const win = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.5, 1.42), new THREE.MeshLambertMaterial({ color: C.taxiWindow, transparent: true, opacity: 0.7 }));
  win.position.set(0, 1.1, -0.1);
  const lightMat = new THREE.MeshLambertMaterial({ color: C.taxiLight, emissive: 0xfff0a0, emissiveIntensity: 0.6 });
  const hl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.1), lightMat);
  hl.position.set(-0.5, 0.55, 1.4);
  const hr = hl.clone(); hr.position.x = 0.5;
  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.25, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: C.taxiWheel });
  const wheels = [[-0.8, 0.9], [0.8, 0.9], [-0.8, -0.9], [0.8, -0.9]];
  for (const [wx, wz] of wheels) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(wx, 0.32, wz);
    g.add(w);
  }
  g.add(body, cabin, win, hl, hr);
  scene.add(g);
}
function placeTaxiAtSpawn() {
  taxi.pos.set(taxiSpawn.x + 0.5, taxiSpawn.y + 0.6, taxiSpawn.z + 0.5);
  taxi.heading = 0; taxi.speed = 0;
  taxi.mesh.position.copy(taxi.pos);
  taxi.mesh.rotation.y = taxi.heading;
}

function carBlocked(x, z) {
  const cx = cell(x), cz = cell(z);
  const gy = Math.round(heightAt(x, z));
  if (heightAt(x, z) < SEA) return true; // no driving into water
  return isSolid(cx, gy + 1, cz) || isSolid(cx, gy + 2, cz);
}

function updateDrive(dt) {
  const accel = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
  taxi.speed += accel * 14 * dt;
  taxi.speed *= 0.93;
  if (keys['Space']) taxi.speed *= 0.82;
  taxi.speed = Math.max(-6, Math.min(11, taxi.speed));
  if (Math.abs(taxi.speed) > 0.15) {
    const steer = (keys['KeyA'] ? 1 : 0) - (keys['KeyD'] ? 1 : 0);
    taxi.heading += steer * 1.8 * dt * Math.sign(taxi.speed);
  }
  const fwd = new THREE.Vector3(Math.sin(taxi.heading), 0, Math.cos(taxi.heading));
  const mv = fwd.clone().multiplyScalar(taxi.speed * dt);
  const tryX = taxi.pos.x + mv.x, tryZ = taxi.pos.z + mv.z;
  if (!carBlocked(tryX, taxi.pos.z)) taxi.pos.x = tryX;
  else taxi.speed *= 0.4;
  if (!carBlocked(taxi.pos.x, tryZ)) taxi.pos.z = tryZ;
  else taxi.speed *= 0.4;
  taxi.pos.x = Math.max(-SIZE, Math.min(SIZE, taxi.pos.x));
  taxi.pos.z = Math.max(-SIZE, Math.min(SIZE, taxi.pos.z));
  taxi.pos.y = heightAt(taxi.pos.x, taxi.pos.z) + 0.6;
  taxi.mesh.position.copy(taxi.pos);
  taxi.mesh.rotation.y = taxi.heading;

  // third-person camera
  const camOff = fwd.clone().multiplyScalar(-7).add(new THREE.Vector3(0, 4, 0));
  camera.position.copy(taxi.pos).add(camOff);
  camera.lookAt(taxi.pos.x, taxi.pos.y + 1, taxi.pos.z);

  rideLogic(dt);
}

function dist2D(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

// ──────────────────────────────────────────────
// NPC passengers (3)
// ──────────────────────────────────────────────

function buildPerson(shirt) {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: C.skin });
  const shirtM = new THREE.MeshLambertMaterial({ color: shirt });
  const hairM = new THREE.MeshLambertMaterial({ color: C.hair });
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.5, 0.22), new THREE.MeshLambertMaterial({ color: 0x34506b }));
  const leg2 = leg.clone(); leg.position.x = -0.13; leg2.position.x = 0.13; leg.position.y = leg2.position.y = 0.25;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.3), shirtM); body.position.y = 0.78;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skin); head.position.y = 1.25;
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.16, 0.44), hairM); hair.position.y = 1.45;
  g.add(leg, leg2, body, head, hair);
  return g;
}
function buildMarker() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.4, 0.08), new THREE.MeshLambertMaterial({ color: 0xf5a623 }));
  const ball = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshLambertMaterial({ color: 0xf5a623, emissive: 0xf5a623, emissiveIntensity: 0.6 }));
  ball.position.y = 1.0;
  g.add(pole, ball); g.position.y = 2.0;
  return g;
}

function pickLandCol(minDistFrom = null, minD = 0) {
  for (let i = 0; i < 40; i += 1) {
    const c = landCols[Math.floor(Math.random() * landCols.length)];
    if (c.y <= SEA) continue;
    if (minDistFrom && Math.hypot(c.x - minDistFrom.x, c.z - minDistFrom.z) < minD) continue;
    return c;
  }
  return landCols[0];
}

class NPC {
  constructor(id, shirt) {
    this.id = id; this.shirt = shirt;
    this.mesh = buildPerson(shirt);
    this.marker = buildMarker();
    this.mesh.add(this.marker);
    scene.add(this.mesh);
    this.state = 'waiting';
    this.waitTime = 0; this.warned = false; this.dup = false;
    this.respawn();
  }
  respawn() {
    this.pos = pickLandCol(null, 0);
    this.dest = pickLandCol(this.pos, 14);
    this.waitTime = 0; this.warned = false;
    this.dup = Math.random() < 0.18;
    this.state = 'waiting';
    this.mesh.visible = true; this.marker.visible = true;
    const y = heightAt(this.pos.x, this.pos.z);
    this.mesh.position.set(this.pos.x + 0.5, y + 0.5, this.pos.z + 0.5);
    logEvent(this.dup ? 'FINGERPRINT_CONFLICT' : 'ORDER_CREATED',
      `${this.id} 在 (${this.pos.x},${this.pos.z}) 等候 · 目的地 (${this.dest.x},${this.dest.z})` + (this.dup ? ' · 疑似一单两买' : ''), this.dup ? 'bad' : '');
    if (this.dup) toast('一单两买风险', `${this.id} 订单指纹冲突`, 'bad');
  }
  tryPickup() {
    if (this.state !== 'waiting') return false;
    const d = Math.hypot(this.pos.x + 0.5 - taxi.pos.x, this.pos.z + 0.5 - taxi.pos.z);
    if (d < 2.6) {
      this.state = 'riding';
      this.mesh.visible = false; this.marker.visible = false;
      destBeacon.show(this.dest);
      logEvent('ORDER_PICKED', `${this.id} 上车 · 前往 (${this.dest.x},${this.dest.z})`);
      toast('接单成功', `${this.id} 已上车，送达赚金币`, 'good');
      return true;
    }
    return false;
  }
  tryDropoff() {
    if (this.state !== 'riding') return false;
    const d = Math.hypot(this.dest.x + 0.5 - taxi.pos.x, this.dest.z + 0.5 - taxi.pos.z);
    if (d < 2.8) {
      const fare = 20 + Math.round(Math.hypot(this.dest.x - this.pos.x, this.dest.z - this.pos.z) * 1.6);
      gov.coins += fare; gov.completed += 1;
      logEvent('ORDER_COMPLETED', `${this.id} 已送达 · 收入 +${fare} 金币`, 'good');
      toast('送达完成', `+${fare} 金币`, 'good');
      destBeacon.hide();
      this.respawn();
      return true;
    }
    return false;
  }
  tick(dt) {
    if (this.state !== 'waiting') return;
    this.waitTime += dt;
    if (!this.warned && this.waitTime > 22) {
      this.warned = true; gov.pressCount += 1;
      logEvent('PRESS_ORDER_WARNING', `${this.id} 等候已 ${Math.round(this.waitTime)}s · 疑似压单`, 'warn');
      toast('压单预警', `${this.id} 久等未派单`, 'warn');
    }
  }
}

const npcs = [];
function spawnNPCs() {
  for (let i = 0; i < 3; i += 1) npcs.push(new NPC(`P-${101 + i}`, SHIRT[i]));
}

// destination beacon for the riding passenger
const destBeacon = {
  group: new THREE.Group(),
  show(col) {
    this.group.clear();
    const mat = new THREE.MeshLambertMaterial({ color: 0x4caf6a, emissive: 0x4caf6a, emissiveIntensity: 0.7, transparent: true, opacity: 0.8 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 4, 8), mat); pole.position.y = 2;
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat); top.position.y = 4.2;
    this.group.add(pole, top); this.group.visible = true;
    const y = heightAt(col.x, col.z);
    this.group.position.set(col.x + 0.5, y + 0.5, col.z + 0.5);
    this.col = col;
  },
  hide() { this.group.visible = false; this.col = null; },
};
destBeacon.hide(); scene.add(destBeacon.group);

let ridingNPC = null;
function rideLogic(dt) {
  for (const n of npcs) n.tick(dt);
  if (!ridingNPC) {
    for (const n of npcs) { if (n.tryPickup()) { ridingNPC = n; break; } }
  } else {
    ridingNPC.tryDropoff();
    if (ridingNPC.state !== 'riding') ridingNPC = null;
  }
  if (destBeacon.group.visible) {
    destBeacon.group.children[1].rotation.y += dt * 2;
    destBeacon.group.children[1].position.y = 4.2 + Math.sin(performance.now() * 0.003) * 0.25;
  }
}

// ──────────────────────────────────────────────
// Governance: metrics, event log, hash chain
// ──────────────────────────────────────────────

const gov = {
  coins: 0, completed: 0, pressCount: 0, broken: 0, placed: 0,
  appeals: 0, chainTampered: false, chainVerified: false,
};
const events = []; // {id, type, summary, time}
let evtCounter = 0;

function logEvent(type, summary, cls = '') {
  evtCounter += 1;
  events.unshift({ id: `E-${String(evtCounter).padStart(3, '0')}`, type, summary, cls });
  if (events.length > 30) events.pop();
  gov.chainVerified = false;
  renderLog();
  renderChain();
}
function renderLog() {
  const el = document.getElementById('log');
  el.innerHTML = events.slice(0, 6).map((e) => `<div class="${e.cls}"><b>${e.type}</b> · ${e.summary}</div>`).join('');
}

function simpleHash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `h${(h >>> 0).toString(16).padStart(8, '0')}`;
}
function buildChain() {
  let prev = 'GENESIS';
  return [...events].reverse().map((e, i) => {
    const payload = `${prev}|${e.id}|${e.type}|${e.summary}`;
    const hash = simpleHash(payload);
    const item = { ...e, prevHash: prev, hash };
    prev = hash;
    return item;
  }).reverse();
}
function verifyChain() {
  const chain = buildChain();
  gov.chainVerified = !gov.chainTampered && chain.every((it, i) => {
    const next = chain[i + 1];
    return !next || next.hash === it.prevHash;
  });
  renderChain();
  toast('证据链校验', gov.chainVerified ? '通过 · 链完整' : (gov.chainTampered ? '⚠ 发现篡改' : '断裂'), gov.chainVerified ? 'good' : 'bad');
}
function renderChain() {
  const chain = buildChain().slice(0, 4);
  const status = gov.chainTampered ? '发现篡改' : gov.chainVerified ? '校验通过' : '待校验';
  const cls = gov.chainTampered ? 'bad' : gov.chainVerified ? 'good' : 'blue';
  document.getElementById('chainStatus').textContent = status;
  document.getElementById('chainStatus').className = `chip ${cls}`;
  document.getElementById('chain').innerHTML = chain.map((it, i) => `
    <div class="chain-item ${gov.chainTampered && i === 0 ? 'broken' : ''}">
      <b>${it.type}</b>
      <span>${gov.chainTampered && i === 0 ? 'prev: BROKEN' : `${it.hash}`}</span>
    </div>`).join('');
}

function fairnessIndex() {
  return Math.max(40, Math.min(99, 92 - gov.pressCount * 4 - dupCount() * 2));
}
function pressRate() {
  const denom = gov.completed + gov.pressCount + 1;
  return Math.round((gov.pressCount / denom) * 100);
}
function dupCount() { return npcs.filter((n) => n.dup && n.state === 'waiting').length; }

const statsEl = document.getElementById('stats');
let hudTimer = 0;
function renderHUD(dt) {
  hudTimer += dt;
  if (hudTimer < 0.15) return;
  hudTimer = 0;
  const waiting = npcs.filter((n) => n.state === 'waiting').length;
  statsEl.innerHTML = `
    <div class="stat good"><span>金币</span><b>${gov.coins}</b></div>
    <div class="stat"><span>已完成</span><b>${gov.completed}</b></div>
    <div class="stat"><span>待接单</span><b>${waiting}</b></div>
    <div class="stat warn"><span>压单率</span><b>${pressRate()}%</b></div>
    <div class="stat"><span>公平指数</span><b>${fairnessIndex()}</b></div>
    <div class="stat bad"><span>一单两买</span><b>${dupCount()}</b></div>
  `;
}

// ──────────────────────────────────────────────
// Toasts
// ──────────────────────────────────────────────

function toast(title, msg, cls = '') {
  const el = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = `toast ${cls}`;
  t.innerHTML = `<b>${title}</b>${msg}`;
  el.appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 3000);
}

// ──────────────────────────────────────────────
// Input
// ──────────────────────────────────────────────

const overlay = document.getElementById('overlay');
const driveHint = document.getElementById('driveHint');

function requestLock() { renderer.domElement.requestPointerLock(); }

addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  if (e.code === 'KeyF') toggleDrive();
  if (e.code === 'KeyR') resetWorld();
  if (mode === 'foot' && locked && ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].includes(e.code)) teleport(e.code);
});
addEventListener('keyup', (e) => { keys[e.code] = false; });

addEventListener('mousemove', (e) => {
  if (mode !== 'foot' || !locked) return;
  player.yaw -= e.movementX * 0.0022;
  player.pitch -= e.movementY * 0.0022;
  player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch));
});

renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('mousedown', handleBlockAction);
renderer.domElement.addEventListener('click', () => { if (mode === 'foot' && !locked) requestLock(); });
document.getElementById('playBtn').addEventListener('click', () => { started = true; requestLock(); });

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  document.body.classList.toggle('locked', locked && mode === 'foot');
  if (mode === 'foot') overlay.classList.toggle('hidden', locked || !started);
});

function toggleDrive() {
  if (mode === 'foot') {
    const d = Math.hypot(taxi.pos.x - player.pos.x, taxi.pos.z - player.pos.z);
    if (d > 3.5) { toast('上车失败', '靠近黄色出租车再按 F', 'warn'); return; }
    mode = 'drive';
    if (document.pointerLockElement) document.exitPointerLock();
    document.body.classList.remove('locked');
    overlay.classList.add('hidden');
    driveHint.classList.add('show');
    logEvent('DRIVER_ON_DUTY', '司机上车，开始营业');
  } else {
    mode = 'foot';
    player.pos.set(taxi.pos.x + 1.5, taxi.pos.y + 0.5, taxi.pos.z);
    player.vel.set(0, 0, 0);
    driveHint.classList.remove('show');
    logEvent('DRIVER_OFF_DUTY', '司机下车');
    requestLock();
  }
}

function teleport(code) {
  const order = ['plains', 'forest', 'mountain', 'desert', 'snow'];
  const want = order[parseInt(code.slice(-1)) - 1];
  const c = landCols.find((c) => c.biome === want) || landCols[0];
  player.pos.set(c.x + 0.5, c.y + 2, c.z + 0.5);
  player.vel.set(0, 0, 0);
  toast('瞬移', `前往 ${want} 群系`, '');
}

document.getElementById('auditBtn').addEventListener('click', () => {
  logEvent('AUDIT_RUN', `审计：压单率 ${pressRate()}% · 公平指数 ${fairnessIndex()}`);
  toast('审计完成', `已完成 ${gov.completed} 单 · 收入 ${gov.coins}`, 'good');
});
document.getElementById('verifyBtn').addEventListener('click', verifyChain);
document.getElementById('tamperBtn').addEventListener('click', () => {
  gov.chainTampered = !gov.chainTampered; gov.chainVerified = false; renderChain();
  toast('证据链', gov.chainTampered ? '已模拟篡改' : '篡改已撤销', gov.chainTampered ? 'bad' : '');
});
document.getElementById('appealBtn').addEventListener('click', () => {
  const warned = npcs.find((n) => n.warned && n.state === 'waiting');
  if (!warned) { toast('申诉', '暂无压单订单可申诉', 'warn'); return; }
  gov.appeals += 1; warned.warned = false;
  logEvent('APPEAL_CREATED', `${warned.id} 压单申诉已提交 (第 ${gov.appeals} 件)`);
  toast('申诉已提交', `${warned.id} · 取证中`, '');
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && document.exitPointerLock) document.exitPointerLock();
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ──────────────────────────────────────────────
// Reset
// ──────────────────────────────────────────────

function resetWorld() {
  generateWorld();
  placeTaxiAtSpawn();
  gov.broken = 0; gov.placed = 0;
  for (const n of npcs) n.respawn();
  ridingNPC = null; destBeacon.hide();
  logEvent('WORLD_RESET', '世界已重新生成');
  toast('世界重置', '地形与生物群系刷新', '');
}

// ──────────────────────────────────────────────
// Main loop
// ──────────────────────────────────────────────

let last = performance.now();
let fpsT = 0, fpsF = 0, fps = 0;

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (mode === 'foot') updateFoot(dt); else updateDrive(dt);

  for (const c of clouds) {
    c.position.x += c.userData.speed * dt;
    if (c.position.x > 60) c.position.x = -60;
  }
  for (const n of npcs) {
    if (n.mesh.visible) {
      n.marker.position.y = 2.0 + Math.sin(now * 0.004 + n.id.charCodeAt(2)) * 0.2;
      n.marker.children[1].rotation.y += dt * 1.5;
    }
  }

  fpsT += dt; fpsF += 1;
  if (fpsT > 0.5) { fps = Math.round(fpsF / fpsT); fpsT = 0; fpsF = 0; }
  renderHUD(dt);

  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

// ──────────────────────────────────────────────
// Boot
// ──────────────────────────────────────────────

generateWorld();
buildTaxiMesh();
placeTaxiAtSpawn();
spawnNPCs();
player.pos.set(spawnPoint.x + 0.5, spawnPoint.y + 2, spawnPoint.z + 2.5);
player.yaw = Math.PI;
logEvent('SYSTEM_READY', '世界就绪 · 3 位顾客等候 · 出租车停在出生点小屋旁');
renderChain();
console.log('[Voxel Dispatch World] v20260617c — ready');
requestAnimationFrame(loop);
