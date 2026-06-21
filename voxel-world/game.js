import * as THREE from 'three';

/* ═══════════════════════════════════════════════════════
   公平派单 · 体素世界 — 三乘客闭环网约车环线
   自由驾驶 + 可见环线路 / 自由模式·限时模式 / 昼夜 / 随机事件
   ═══════════════════════════════════════════════════════ */

// 发生运行错误时显示在入口卡片上，避免黑屏无从排查。
function showErr(info) {
  // 顶部固定大红框：无论 overlay-card 是否存在都能看到完整错误
  let box = document.getElementById('fatalErr');
  if (!box) {
    box = document.createElement('div');
    box.id = 'fatalErr';
    box.style.cssText = 'position:fixed;left:8px;right:8px;top:8px;z-index:9999;background:#2a0d0d;color:#ff9a9a;font-family:ui-monospace,monospace;font-size:12px;padding:12px;border:2px solid #ef6f6f;border-radius:8px;white-space:pre-wrap;max-height:80vh;overflow:auto;box-shadow:0 8px 30px rgba(0,0,0,.5)';
    document.body.appendChild(box);
  }
  box.textContent = '⚠ 运行出错（请截图发回）：\n\n' + info;
  const card = document.querySelector('.overlay-card');
  if (card) {
    card.innerHTML = `<p class="eyebrow" style="color:#ef6f6f">运行出错</p>
      <h1>游戏加载失败</h1>
      <p class="lead" style="white-space:pre-wrap;font-family:ui-monospace,monospace;color:#ef6f6f;font-size:11px">${info}</p>`;
    document.getElementById('overlay').classList.remove('hidden');
  }
}
window.addEventListener('error', (e) => {
  const err = e.error || e;
  showErr(`${String(e.message)}\n${(err && err.stack) ? err.stack : ''}`);
  console.error('[体素世界]', e);
});
window.addEventListener('unhandledrejection', (e) => {
  showErr(`Promise: ${String(e.reason && e.reason.stack ? e.reason.stack : e.reason)}`);
});

// ──────────────────────────────────────────────
// Config & palette
// ──────────────────────────────────────────────

const SIZE = 432;                // 世界边长扩大至 3 倍
const HALF = SIZE / 2;
const MAX_OPAQUE = 650000;
const MAX_WATER = 80000;
const MAX_DECO = 60000;

const C = {
  grass: 0x7ec85a, dirt: 0x9b7653, stone: 0x8e9aa2, sand: 0xecd98a,
  snow: 0xf4faff, ice: 0xa9dcff, water: 0x3b8fd6, deepWater: 0x2a6fb8,
  road: 0x4a4a52, roadLine: 0xf2e36a, curb: 0x6b6b73,
  asphalt: 0x3a3a40, asphaltDark: 0x2e2e34, patch: 0x4a4a52, shoulder: 0x8a8a90, gravel: 0x9a9088, grassEdge: 0x6fae4a,
  stoneBridge: 0xb8b0a0, bridgeRail: 0xd8d2c4,
  lineWhite: 0xf2f2f0, arrow: 0xf2e36a, lineYellow: 0xf4c830,
  oakWood: 0x6e5230, oakLeaves: 0x5fa83a, birchWood: 0xd8cdb6, birchLeaves: 0x8fcf5a,
  spruceWood: 0x4a3522, spruceLeaves: 0x2f6b3a, palmWood: 0xc39a5e, palmLeaves: 0x4fae5a,
  cactus: 0x3a9d4a, flowerRed: 0xe54848, flowerWhite: 0xf5f5f5, flowerYellow: 0xf4d03f,
  tuft: 0x6fb04a, cloud: 0xffffff, reed: 0x9bbf6a, rice: 0xd8c96a,
  // 建筑
  log: 0x7a5a32, planks: 0xc39a5e, glass: 0xbfe3ef, roof: 0x8a5a3a, brick: 0xb56a4a,
  concrete: 0xcfcabf, paintA: 0xe8d3a0, paintB: 0xa8c8d8, paintC: 0xd8a8b8, paintD: 0xb8c8a0,
  signCity: 0x2f6bd6, signForest: 0x6e4a2a, signLake: 0xf0f0f5,
  neon: [0xff5a8a, 0x5ad7ff, 0xffd23f, 0x7a5cff],
  lamp: 0xfff4c2,
  // 车
  taxiBody: 0xffd23f, taxiWindow: 0xbfe3ef, taxiWheel: 0x2b2b2b, taxiLight: 0xfff4c2,
  skin: 0xf0c8a0, hair: 0x3a2a1a, shirtA: 0xef6f6f, shirtB: 0x4ea3e8, shirtC: 0xf5c542,
};

// ──────────────────────────────────────────────
// Renderer / scene / camera
// ──────────────────────────────────────────────

const scene = new THREE.Scene();
scene.background = makeSkyTexture('day');
scene.fog = new THREE.Fog(0xcdeeff, 36, 260);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 700);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('stage').appendChild(renderer.domElement);

// ──────────────────────────────────────────────
// Lights
// ──────────────────────────────────────────────

const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x6a7a4a, 0.95);
scene.add(hemi);
const amb = new THREE.AmbientLight(0xffffff, 0.35);
scene.add(amb);
const sun = new THREE.DirectionalLight(0xfff2d0, 0.85);
sun.position.set(40, 70, 30);
scene.add(sun);

function makeSkyTexture(mode) {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  if (mode === 'night') {
    g.addColorStop(0, '#0a1430'); g.addColorStop(0.5, '#15244a'); g.addColorStop(1, '#243a66');
  } else {
    g.addColorStop(0, '#3f8fd6'); g.addColorStop(0.45, '#7fbcf0'); g.addColorStop(0.8, '#bfe3f5'); g.addColorStop(1, '#dff3ff');
  }
  ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ──────────────────────────────────────────────
// Voxel storage + instanced meshes
// ──────────────────────────────────────────────

const blocks = new Map();
const keyOf = (x, y, z) => `${x},${y},${z}`;
const cell = (v) => Math.floor(v + 0.5);
const heightMap = new Map();
const emissives = []; // {mesh/mat, dayIntensity, nightIntensity} for night lighting

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const opaqueMesh = new THREE.InstancedMesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX_OPAQUE);
opaqueMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); opaqueMesh.count = 0; scene.add(opaqueMesh);
const waterMesh = new THREE.InstancedMesh(boxGeo, new THREE.MeshLambertMaterial({ color: C.water, transparent: true, opacity: 0.78 }), MAX_WATER);
waterMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); waterMesh.count = 0; scene.add(waterMesh);
const decoGeo = new THREE.BoxGeometry(1, 1, 1);
const decoMesh = new THREE.InstancedMesh(decoGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX_DECO);
decoMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); decoMesh.count = 0; scene.add(decoMesh);

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
      waterMesh.setMatrixAt(wi, dummy.matrix); waterKeys[wi] = k; wi += 1;
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
function setBlock(x, y, z, color, water = false) { blocks.set(keyOf(x, y, z), { color, water }); }
function delBlock(x, y, z) { blocks.delete(keyOf(x, y, z)); }
function isSolid(x, y, z) { const b = blocks.get(keyOf(x, y, z)); return b && !b.water; }
function isWater(x, y, z) { const b = blocks.get(keyOf(x, y, z)); return b && b.water; }
function heightAt(x, z) { return heightMap.get(`${cell(x)},${cell(z)}`) ?? 4; }
function decoCube(x, y, z, s, color) { decoData.push({ x, y, z, s, color }); }

// 独立 Mesh（带 emissive 的灯/招牌/特殊物体），昼夜切换时调强度
const dynMeshes = [];
function addDyn(mesh, opts = {}) {
  scene.add(mesh);
  dynMeshes.push({ mesh, ...opts });
  return mesh;
}

// ──────────────────────────────────────────────
// Perlin noise
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
const noiseD = makePerlin(4242);
function fbm(n, x, y, oct = 4) {
  let e = 0, amp = 1, freq = 1, sum = 0;
  for (let i = 0; i < oct; i += 1) { e += amp * n(x * freq, y * freq); sum += amp; amp *= 0.5; freq *= 2; }
  return e / sum;
}

// ──────────────────────────────────────────────
// 自然地形 + 不规则椭圆环形公路
// ──────────────────────────────────────────────
// 全局自然地形（Perlin 起伏），仅椭圆环形公路整平，中央圆形湖泊，中式石拱桥跨湖。
// 坐标范围 x,z ∈ [-HALF, HALF]。

const ZONES = ['nature'];
const ZONE_NAMES = { nature: '自然原野' };

// 椭圆环形公路参数
const ELLIPSE_A = HALF - 76;   // x 方向半轴（留出外部分支与主题区）
const ELLIPSE_B = HALF - 152;  // z 方向半轴（大幅缩小→明显偏扁的椭圆，A/B≈2.2）
const ROAD_Y = 6;              // 路面统一高度（整平）
const LAKE_R = 28;             // 中央湖基准半径
const LAKE_A = 34;             // 湖 x 方向半轴（不规则椭圆）
const LAKE_B = 22;             // 湖 z 方向半轴
const BRIDGE_HALF_LEN = 6;     // 拱桥半长（沿公路方向）

// 不规则椭圆湖：判断世界点是否在湖内
function inLake(x, z) {
  const ang = Math.atan2(z, x);
  // 基础椭圆半径 + Perlin 扰动 → 不规则
  const base = (LAKE_A * LAKE_B) / Math.sqrt((LAKE_B * Math.cos(ang)) ** 2 + (LAKE_A * Math.sin(ang)) ** 2);
  const r = base * (1 + fbm(noiseD, Math.cos(ang) * 3, Math.sin(ang) * 3) * 0.15);
  return Math.sqrt(x * x + z * z) < r;
}

// 不规则椭圆半径（加噪声扰动）
function ellipseRadius(angle) {
  const base = (ELLIPSE_A * ELLIPSE_B) / Math.sqrt((ELLIPSE_B * Math.cos(angle)) ** 2 + (ELLIPSE_A * Math.sin(angle)) ** 2);
  const wobble = 1 + fbm(noiseD, Math.cos(angle) * 2, Math.sin(angle) * 2) * 0.06;
  return base * wobble;
}
// 椭圆上某角度对应的世界坐标
function ellipsePoint(angle) {
  const r = ellipseRadius(angle);
  return { x: Math.cos(angle) * r, z: Math.sin(angle) * r };
}
// 世界点到椭圆中心的"归一化半径"（>1 在椭圆外，<1 在内）
function ellipseNorm(x, z) {
  return Math.sqrt((x / ELLIPSE_A) ** 2 + (z / ELLIPSE_B) ** 2);
}
function zoneAt(x, z) {
  // 简化：用于氛围切换的伪分区（仍统一自然地形）
  const ang = Math.atan2(z, x);
  if (ang > -Math.PI * 0.25 && ang <= Math.PI * 0.25) return 'nature';
  return 'nature';
}

// 段的属性：单一自然风格雾色/光照
const ZONE_STYLE = {
  nature: { fogDay: 0xddeee0, fogNight: 0x101822, sunDay: 0xfff2d0, sunNight: 0x4a5a8a, hemiDay: 0xcfe8d8, fogNear: 36, fogFar: 270 },
  city:   { fogDay: 0xddeee0, fogNight: 0x101822, sunDay: 0xfff2d0, sunNight: 0x4a5a8a, hemiDay: 0xcfe8d8, fogNear: 28, fogFar: 150 },
  forest: { fogDay: 0xd2e2c8, fogNight: 0x101822, sunDay: 0xdfe8d0, sunNight: 0x4a5a8a, hemiDay: 0xc8dcb8, fogNear: 24, fogFar: 130 },
  lake:   { fogDay: 0xdfeef5, fogNight: 0x12203a, sunDay: 0xfff5e0, sunNight: 0x5a7ab0, hemiDay: 0xd0eaf5, fogNear: 30, fogFar: 160 },
  field:  { fogDay: 0xe6e8d8, fogNight: 0x141820, sunDay: 0xfff2d0, sunNight: 0x6a6a9a, hemiDay: 0xd0d8b8, fogNear: 28, fogFar: 150 },
};

// ──────────────────────────────────────────────
// Route: 沿椭圆采样的有序路点
// ──────────────────────────────────────────────

const routePoints = []; // {x,z,kind,label}
const branchRoutes = []; // 向外分支路线：沙滩别墅 / 农场木屋 / 乡村小镇
const ROAD_HALF_W = 4;  // 路面半宽 — 9 格（加宽）

function pushRoute(x, z, kind, label) { routePoints.push({ x, z, kind, label }); }

function buildRoutePlan() {
  routePoints.length = 0;
  const N = 96; // 扩大地图后的椭圆采样点数，转弯更平滑
  for (let i = 0; i < N; i += 1) {
    const ang = (i / N) * Math.PI * 2;
    const p = ellipsePoint(ang);
    pushRoute(Math.round(p.x), Math.round(p.z), 'waypoint', '');
  }
  routePoints[0].kind = 'station'; routePoints[0].label = '网约车场站';
  const place = (idx, kind, label) => { if (routePoints[idx]) { routePoints[idx].kind = kind; routePoints[idx].label = label; } };
  // 候车点刻意远离所有分支路口（12/44/76）：每位乘客等候点与其目的地路口相距约 48 格，
  // 且与任一分支路口至少相距 16 格，保证乘客不在目标路口附近。
  place(28, 'pickup', '北郊候车点');
  place(60, 'pickup', '南郊候车点');
  place(92, 'pickup', '东郊候车点');
}

function buildBranchRoutes() {
  branchRoutes.length = 0;
  const defs = [
    { id: 'beach', name: '夏日沙滩别墅', tag: '海边', theme: 'beachVilla', ringIdx: 12, length: 58, color: '#f5c542', dropBack: 8 },
    { id: 'farm', name: '农场木屋', tag: '乡村', theme: 'farmCabin', ringIdx: 44, length: 58, color: '#8a5a3a', dropBack: 8 },
    { id: 'town', name: '乡村小镇', tag: '小镇', theme: 'countryTown', ringIdx: 76, length: 64, color: '#7a5cff', dropBack: 30 },
  ];
  for (const def of defs) {
    const start = routePoints[def.ringIdx];
    const ang = Math.atan2(start.z, start.x);
    const dirX = Math.cos(ang), dirZ = Math.sin(ang);
    const points = [];
    for (let s = 0; s <= def.length; s += 4) {
      points.push({ x: Math.round(start.x + dirX * s), z: Math.round(start.z + dirZ * s) });
    }
    const end = points[points.length - 1];
    // 路边下车点：在房子外的支路上（沿分支线回退 dropBack 距离）。小镇回退更多，停在镇外路口而非镇内房屋间。
    const dropS = Math.max(0, def.length - def.dropBack);
    const dropPt = { x: Math.round(start.x + dirX * dropS), z: Math.round(start.z + dirZ * dropS), kind: 'dropoff', label: def.name + '·路边' };
    branchRoutes.push({ ...def, start, points, end: { ...end, kind: 'home', label: def.name }, dropPt });
  }
}

function paveBranchRoutes() {
  for (const br of branchRoutes) {
    for (let i = 0; i < br.points.length - 1; i += 1) paveBetween(br.points[i], br.points[i + 1]);
    const e = br.end;
    for (let ox = -4; ox <= 4; ox += 1)
      for (let oz = -4; oz <= 4; oz += 1) {
        flattenColumn(e.x + ox, e.z + oz, ROAD_Y);
        setBlock(e.x + ox, ROAD_Y, e.z + oz, Math.abs(ox) <= 2 && Math.abs(oz) <= 2 ? C.gravel : C.shoulder);
        for (let dy = 1; dy <= 4; dy += 1) delBlock(e.x + ox, ROAD_Y + dy, e.z + oz);
      }
  }
}

// 拱桥：沿 x 轴横跨不规则椭圆湖（z≈0 附近），桥面拱形可通行车辆
const BRIDGE_Z_HALF = ROAD_HALF_W; // 桥面 z 方向半宽：与公路同宽，出租车可稳定通行
function onBridge(x, z) {
  return inLake(x, z) && Math.abs(z) <= BRIDGE_Z_HALF;
}
// 桥外引道（湖岸两侧，连到公路）
function onBridgeApproach(x, z) {
  return !inLake(x, z) && Math.abs(z) <= BRIDGE_Z_HALF && Math.abs(x) <= LAKE_A + 6 && Math.abs(x) >= LAKE_A - 2;
}
// 车行桥面保持与道路同高；侧面支撑保留拱桥观感，避免台阶影响出租车通行。
function bridgeY() {
  return ROAD_Y;
}

// 在两个路点之间铺路（纯灰沥青 + 标线），路面整平到 ROAD_Y
function paveBetween(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const dist = Math.max(Math.abs(dx), Math.abs(dz));
  const steps = Math.max(1, Math.round(dist));
  const eastWest = Math.abs(dx) >= Math.abs(dz);
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const cx = Math.round(a.x + dx * t);
    const cz = Math.round(a.z + dz * t);
    // 路面高度：拱桥段用拱形，否则整平 ROAD_Y
    let gy = ROAD_Y;
    if (onBridge(cx, cz)) gy = Math.round(bridgeY(cx));
    // 整平：强制该列高度为 gy
    heightMap.set(`${cx},${cz}`, gy);
    for (let ox = -ROAD_HALF_W - 1; ox <= ROAD_HALF_W + 1; ox += 1) {
      for (let oz = -ROAD_HALF_W - 1; oz <= ROAD_HALF_W + 1; oz += 1) {
        const x = cx + ox, z = cz + oz;
        const edge = Math.abs(ox) === ROAD_HALF_W + 1 || Math.abs(oz) === ROAD_HALF_W + 1;
        const shoulder = Math.abs(ox) === ROAD_HALF_W || Math.abs(oz) === ROAD_HALF_W;
        // 整平该格到 gy
        flattenColumn(x, z, gy);
        let col;
        if (onBridge(x, z)) {
          col = C.stoneBridge; // 桥面石质
        } else if (edge) col = C.grassEdge;
        else if (shoulder) col = C.shoulder;
        else col = C.asphalt; // 纯灰沥青
        setBlock(x, gy, z, col);
        delBlock(x, gy + 1, z);
      }
    }
    // 标线
    if (eastWest) { setBlock(cx, gy, cz - ROAD_HALF_W, C.lineWhite); setBlock(cx, gy, cz + ROAD_HALF_W, C.lineWhite); }
    else { setBlock(cx - ROAD_HALF_W, gy, cz, C.lineWhite); setBlock(cx + ROAD_HALF_W, gy, cz, C.lineWhite); }
    if (i % 2 === 0) setBlock(cx, gy, cz, C.lineWhite);
    if (i % 6 === 0) setBlock(cx, gy, cz, C.arrow);
  }
}

// 把某列整平到目标高度：删高于 gy 的方块，补低于 gy 的到 gy（顶面 grass，下方 dirt，无凹陷）
function flattenColumn(x, z, gy) {
  for (let y = gy + 1; y < gy + 10; y += 1) delBlock(x, y, z);
  for (let y = 1; y <= gy; y += 1) {
    if (!blocks.has(keyOf(x, y, z))) {
      setBlock(x, y, z, y === gy ? C.grass : C.dirt);
    } else if (y === gy) {
      // 顶面确保是 grass（草地表面连续，不露土）
      setBlock(x, y, z, C.grass);
    }
  }
  heightMap.set(`${x},${z}`, gy);
}

function paveRoute() {
  for (let i = 0; i < routePoints.length; i += 1) {
    paveBetween(routePoints[i], routePoints[(i + 1) % routePoints.length]);
  }
  const last = routePoints[routePoints.length - 1];
  const first = routePoints[0];
  paveBetween(last, first);
}

// 中式石拱桥：沿 x 轴横跨不规则椭圆湖，桥身拱起、桥面平整可通行、两端与路面齐平
function buildArchBridge() {
  const bridgeMinX = -LAKE_A - 6;
  const bridgeMaxX = LAKE_A + 6;
  for (let x = bridgeMinX; x <= bridgeMaxX; x += 1) {
    const gy = Math.round(bridgeY(x));
    const inBridgeSpan = Math.abs(x) <= LAKE_A + 1;
    for (let z = -BRIDGE_Z_HALF; z <= BRIDGE_Z_HALF; z += 1) {
      const inLk = inLake(x, z);
      if (!inLk && !onBridgeApproach(x, z) && !inBridgeSpan) continue;
      flattenColumn(x, z, gy);
      // 桥面石板：中心车道完全清空，避免栏杆/装饰占据出租车通行空间。
      const slabColor = (x + z) % 4 === 0 ? 0xc9c2b4 : C.stoneBridge;
      setBlock(x, gy, z, slabColor);
      for (let dy = 1; dy <= 3; dy += 1) delBlock(x, gy + dy, z);
      if (Math.abs(z) === BRIDGE_Z_HALF && x % 3 === 0) decoCube(x, gy + 0.58, z, 0.22, 0xf0eadc);
    }
    // 桥拱支撑与栏杆只在车道外侧生成，不进入 z=-2..2 的通行带。
    for (const sideZ of [-BRIDGE_Z_HALF - 1, BRIDGE_Z_HALF + 1]) {
      if (inLake(x, 0)) {
        for (let y = 2; y < gy; y += 1) {
          if ((x + y) % 2 === 0 || y < 4) setBlock(x, y, sideZ, C.stoneBridge);
        }
      }
      setBlock(x, gy, sideZ, C.stoneBridge);
      if (x % 2 === 0) setBlock(x, gy + 1, sideZ, C.bridgeRail);
      else delBlock(x, gy + 1, sideZ);
      if (x % 8 === 0) setBlock(x, gy + 2, sideZ, C.bridgeRail);
      else delBlock(x, gy + 2, sideZ);
    }
  }
  // 拱顶中式亭柱装饰放在栏杆外侧，不占桥面车道。
  const topY = Math.round(bridgeY(0));
  for (const sideZ of [-BRIDGE_Z_HALF - 2, BRIDGE_Z_HALF + 2]) {
    setBlock(0, topY + 1, sideZ, C.stoneBridge);
    setBlock(0, topY + 2, sideZ, C.stoneBridge);
    setBlock(0, topY + 3, sideZ, C.bridgeRail);
  }

  // 桥两端引道：从湖岸(x=±LAKE_A)整平连接到椭圆公路(x=±ELLIPSE_A, z=0)
  for (const side of [1, -1]) {
    const x0 = side * (LAKE_A + 1);
    const x1 = side * ELLIPSE_A;
    const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
    for (let x = lo; x <= hi; x += 1) {
      for (let z = -BRIDGE_Z_HALF; z <= BRIDGE_Z_HALF; z += 1) {
        flattenColumn(x, z, ROAD_Y);
        setBlock(x, ROAD_Y, z, (x + z) % 3 === 0 ? 0xa89f94 : C.gravel); // 砾石引道
        for (let dy = 1; dy <= 4; dy += 1) delBlock(x, ROAD_Y + dy, z);
      }
    }
  }

  // 最后再强制打一遍整条车行桥：从西侧环路到东侧环路，7 格宽，桥面平直、头顶清空。
  for (let x = -ELLIPSE_A; x <= ELLIPSE_A; x += 1) {
    for (let z = -ROAD_HALF_W; z <= ROAD_HALF_W; z += 1) {
      flattenColumn(x, z, ROAD_Y);
      heightMap.set(`${x},${z}`, ROAD_Y);
      const isCenter = Math.abs(z) <= 1;
      const deck = isCenter ? C.asphalt : ((x + z) % 3 === 0 ? 0xc9c2b4 : C.stoneBridge);
      setBlock(x, ROAD_Y, z, deck);
      for (let dy = 1; dy <= 5; dy += 1) delBlock(x, ROAD_Y + dy, z);
    }
    // 栏杆只在车道外，桥头前后两排石柱清空，入口/出口更干净。
    for (const sideZ of [-ROAD_HALF_W - 1, ROAD_HALF_W + 1]) {
      const clearEndPosts = Math.abs(Math.abs(x) - ELLIPSE_A) <= 2;
      if (clearEndPosts) {
        for (let dy = 0; dy <= 2; dy += 1) delBlock(x, ROAD_Y + dy, sideZ);
      } else {
        setBlock(x, ROAD_Y, sideZ, C.stoneBridge);
        if (x % 3 === 0) setBlock(x, ROAD_Y + 1, sideZ, C.bridgeRail);
        else delBlock(x, ROAD_Y + 1, sideZ);
        delBlock(x, ROAD_Y + 2, sideZ);
      }
    }
  }
}

// 住宅支路：从 home 路点向椭圆内侧延伸窄支路
function buildDriveways() {
  const homes = routePoints.filter(p => p.kind === 'home');
  for (const h of homes) {
    // 朝椭圆中心方向
    const ang = Math.atan2(h.z, h.x);
    const dir = [-Math.cos(ang), -Math.sin(ang)];
    for (let s = 1; s <= 5; s += 1) {
      const cx = Math.round(h.x + dir[0] * (ROAD_HALF_W + 1 + s));
      const cz = Math.round(h.z + dir[1] * (ROAD_HALF_W + 1 + s));
      const gy = ROAD_Y;
      flattenColumn(cx, cz, gy);
      for (let ox = -1; ox <= 1; ox += 1) {
        for (let oz = -1; oz <= 1; oz += 1) {
          if (Math.abs(ox) + Math.abs(oz) <= 1) { setBlock(cx + ox, gy, cz + oz, C.gravel); delBlock(cx + ox, gy + 1, cz + oz); }
        }
      }
    }
  }
}

// ──────────────────────────────────────────────
// World generation — 自然地形 + 椭圆环公路 + 中央圆湖 + 拱桥
// ──────────────────────────────────────────────

function buildSurfaceColumn(x, z, h, surfaceColor) {
  heightMap.set(`${x},${z}`, h);
  if (h > 1) setBlock(x, h - 1, z, C.dirt);
  setBlock(x, h, z, surfaceColor);
}

function generateWorld() {
  blocks.clear(); heightMap.clear(); decoData.length = 0;
  buildRoutePlan();
  buildBranchRoutes();

  // 1) 三倍地图采用轻量地表：完整高度仍记录在 heightMap，避免百万级地下方块压垮浏览器。
  for (let x = -HALF; x < HALF; x += 1) {
    for (let z = -HALF; z < HALF; z += 1) {
      const isLake = inLake(x, z);
      let h = 5 + fbm(noiseE, x * 0.025 + 100, z * 0.025 + 100) * 3;
      h = Math.round(h);
      if (h < 4) h = 4;
      if (isLake) h = 1;
      let col;
      if (isLake) col = C.sand;
      else if (h >= 8) col = C.stone;
      else col = C.grass;
      buildSurfaceColumn(x, z, h, col);
    }
  }

  // 2) 中央不规则椭圆湖湖水
  for (let x = -LAKE_A - 5; x <= LAKE_A + 5; x += 1)
    for (let z = -LAKE_B - 5; z <= LAKE_B + 5; z += 1)
      if (inLake(x, z))
        for (let y = 2; y <= 3; y += 1) setBlock(x, y, z, C.water, true);

  // 3) 铺环形主路、向外分支和中央车行桥
  paveRoute();
  paveBranchRoutes();
  buildArchBridge();

  // 4) 构建三个主题终点，再补自然植被，主题区/道路会清理树木避免堵车。
  buildThemeDestinations();
  buildNature();

  rebuildInstances();
  rebuildDeco();
}


function nearBranchOrTheme(x, z) {
  for (const br of branchRoutes) {
    for (const p of br.points) if (Math.hypot(p.x - x, p.z - z) < ROAD_HALF_W + 4) return true;
    if (Math.hypot(br.end.x - x, br.end.z - z) < 30) return true;
  }
  return false;
}
function clearAir(x, z, baseY, h = 8) { for (let dy = 1; dy <= h; dy += 1) delBlock(x, baseY + dy, z); }
function themePad(cx, cz, rx, rz, color = C.grass) {
  for (let x = cx - rx; x <= cx + rx; x += 1)
    for (let z = cz - rz; z <= cz + rz; z += 1) {
      flattenColumn(x, z, ROAD_Y);
      setBlock(x, ROAD_Y, z, color);
      clearAir(x, z, ROAD_Y, 9);
    }
}
function themeHouse(cx, cz, w, d, h, wall, roof, trim = C.glass) {
  themePad(cx, cz, Math.ceil(w / 2) + 1, Math.ceil(d / 2) + 1, C.grass);
  const x0 = cx - Math.floor(w / 2), z0 = cz - Math.floor(d / 2);
  for (let x = 0; x < w; x += 1)
    for (let z = 0; z < d; z += 1)
      for (let y = 1; y <= h; y += 1) {
        const edge = x === 0 || z === 0 || x === w - 1 || z === d - 1;
        if (edge) setBlock(x0 + x, ROAD_Y + y, z0 + z, (y === 2 && (x + z) % 4 === 0) ? trim : wall);
      }
  for (let x = -1; x <= w; x += 1)
    for (let z = -1; z <= d; z += 1) {
      const ridge = Math.abs(x - w / 2) < 1;
      setBlock(x0 + x, ROAD_Y + h + 1 + (ridge ? 1 : 0), z0 + z, roof);
    }
}
function fenceRect(cx, cz, rx, rz) {
  for (let x = cx - rx; x <= cx + rx; x += 1) {
    setBlock(x, ROAD_Y + 1, cz - rz, C.oakWood); setBlock(x, ROAD_Y + 1, cz + rz, C.oakWood);
  }
  for (let z = cz - rz; z <= cz + rz; z += 1) {
    setBlock(cx - rx, ROAD_Y + 1, z, C.oakWood); setBlock(cx + rx, ROAD_Y + 1, z, C.oakWood);
  }
}
function placeThemeAnimal(kind, x, z, rot = 0) {
  const m = buildAnimalModel(kind);
  m.position.set(x, heightAt(x, z) + 0.55, z); m.rotation.y = rot;
  addDyn(m, { themeAnimal: true });
  wanderers.push({ mesh: m, home: { x, z }, radius: 12, speed: 1.1, yOff: 0.55, target: { x, z }, t: 1 + Math.random() * 3, legs: null });
  return m;
}
function placeThemePerson(x, z, shirt, label = '') {
  const m = buildPerson(shirt);
  m.position.set(x, heightAt(x, z) + 0.5, z); m.rotation.y = Math.random() * 6;
  addDyn(m, { themeNpc: true, label });
  wanderers.push({ mesh: m, home: { x, z }, radius: 10, speed: 1.5, yOff: 0.5, target: { x, z }, t: Math.random() * 3, legs: [m.children[0], m.children[1]] });
  return m;
}
function fruitTree(x, z, fruit = C.flowerRed) {
  const y = heightAt(x, z);
  plantOakVariant(x, y, z, C.oakWood, 0x6fb04a);
  decoCube(x + 1, y + 3.1, z, 0.18, fruit); decoCube(x - 1, y + 2.8, z, 0.18, fruit); decoCube(x, y + 3, z + 1, 0.18, fruit);
}
function buildThemeDestinations() {
  for (const br of branchRoutes) {
    if (br.theme === 'beachVilla') buildBeachVilla(br.end);
    else if (br.theme === 'farmCabin') buildFarmCabin(br.end);
    else if (br.theme === 'countryTown') buildCountryTown(br.end);
  }
}
function buildBeachVilla(pt) {
  const { x: cx, z: cz } = pt;
  themePad(cx, cz, 26, 22, C.sand);
  // 海水/浅湾
  for (let x = cx - 28; x <= cx + 28; x += 1)
    for (let z = cz + 12; z <= cz + 30; z += 1) {
      flattenColumn(x, z, 2);
      setBlock(x, 2, z, C.sand); setBlock(x, 3, z, (x + z) % 5 === 0 ? C.deepWater : C.water, true);
    }
  themeHouse(cx - 4, cz - 2, 10, 8, 5, 0xf7f1df, 0xf5c542, C.glass);
  // 露台、躺椅、沙滩伞
  for (let x = cx - 12; x <= cx + 8; x += 1) for (let z = cz + 5; z <= cz + 9; z += 1) setBlock(x, ROAD_Y, z, C.planks);
  for (const [dx, dz] of [[-18,-10],[15,-8],[-20,5],[18,6]]) plantPalmVariant(cx + dx, ROAD_Y, cz + dz);
  for (const [dx, dz, col] of [[-12,12,0xff5a8a],[-8,14,0x5ad7ff],[10,13,0xffd23f]]) {
    stack(cx + dx, ROAD_Y + 1, cz + dz, [[2, C.palmWood]]); setBlock(cx + dx, ROAD_Y + 3, cz + dz, col);
    setBlock(cx + dx + 1, ROAD_Y + 3, cz + dz, col); setBlock(cx + dx - 1, ROAD_Y + 3, cz + dz, col);
  }
  placeThemePerson(cx + 18, cz + 18, 0x6bb8d6, '钓鱼人');
  setBlock(cx + 19, ROAD_Y + 1, cz + 19, C.oakWood); setBlock(cx + 20, ROAD_Y + 1, cz + 20, C.oakWood);
  // 木栈桥伸入海面 + 栈桥尽头小船
  for (let z = cz + 12; z <= cz + 22; z += 1) {
    setBlock(cx + 6, ROAD_Y, z, C.planks);
    if (z % 4 === 0) { setBlock(cx + 5, ROAD_Y, z, C.oakWood); setBlock(cx + 7, ROAD_Y, z, C.oakWood); }
  }
  setBlock(cx + 6, ROAD_Y + 1, cz + 20, 0xef6f6f); setBlock(cx + 6, ROAD_Y + 1, cz + 21, 0xef6f6f);
  setBlock(cx + 6, ROAD_Y + 2, cz + 20, 0xf0f0f0);
  // 沙滩躺椅（木框 + 黄垫）
  for (const [dx, dz] of [[-6, 8], [-4, 8], [6, 8], [8, 8]]) {
    setBlock(cx + dx, ROAD_Y, cz + dz, C.planks); decoCube(cx + dx, ROAD_Y + 0.3, cz + dz, 0.5, 0xffd23f);
  }
  // 排球网
  for (let z = cz + 6; z <= cz + 10; z += 1) {
    setBlock(cx - 2, ROAD_Y + 1, z, 0xffffff); setBlock(cx + 2, ROAD_Y + 1, z, 0xffffff); setBlock(cx, ROAD_Y + 2, z, 0xffffff);
  }
  // 沙堡 + 贝壳
  for (const [dx, dz] of [[-14, 6], [12, 4], [-10, 10]]) {
    stack(cx + dx, ROAD_Y + 1, cz + dz, [[1, 0xf0e0b0], [1, 0xe8d090]]);
    decoCube(cx + dx, ROAD_Y + 0.2, cz + dz + 2, 0.18, 0xffe8c0);
  }
  // 椰子树补种 + 沙滩指示牌
  for (const [dx, dz] of [[-22, -2], [20, -4], [-24, 8], [22, 10]]) plantPalmVariant(cx + dx, ROAD_Y, cz + dz);
  stack(cx + 14, ROAD_Y + 1, cz - 10, [[3, C.oakWood]]); setBlock(cx + 14, ROAD_Y + 4, cz - 10, 0xf5c542);
}
function buildFarmCabin(pt) {
  const { x: cx, z: cz } = pt;
  themePad(cx, cz, 30, 24, C.grass);
  themeHouse(cx - 10, cz - 2, 9, 8, 4, C.planks, C.roof, C.glass);
  fenceRect(cx + 9, cz, 16, 12);
  for (let x = cx - 28; x <= cx - 16; x += 2) for (let z = cz + 8; z <= cz + 20; z += 2) decoCube(x, ROAD_Y + 0.45, z, 0.35, C.rice);
  for (const [dx, dz, kind] of [[4,-6,'cow'],[10,-7,'cow'],[15,-3,'sheep'],[4,5,'sheep'],[13,6,'horse'],[19,2,'horse']]) placeThemeAnimal(kind, cx + dx, cz + dz, hash3(cx + dx, 2, cz + dz));
  for (const [dx,dz] of [[-22,-12],[-18,14],[22,-14],[24,14]]) decoCube(cx + dx, ROAD_Y + 0.55, cz + dz, 0.55, C.tuft);
  windmill(cx - 25, ROAD_Y, cz - 14);
  // 拖拉机（红车身 + 黑轮 + 驾驶舱）
  stack(cx + 14, ROAD_Y + 1, cz - 10, [[1, 0xc0392b], [1, 0xc0392b]]);
  setBlock(cx + 13, ROAD_Y + 1, cz - 11, 0x222222); setBlock(cx + 15, ROAD_Y + 1, cz - 11, 0x222222);
  setBlock(cx + 13, ROAD_Y + 1, cz - 9, 0x2b2b2b); setBlock(cx + 15, ROAD_Y + 1, cz - 9, 0x2b2b2b);
  setBlock(cx + 14, ROAD_Y + 3, cz - 10, 0x2b2b2b);
  // 干草垛
  for (const [dx, dz] of [[20, -12], [22, -10], [-24, 10]]) stack(cx + dx, ROAD_Y + 1, cz + dz, [[2, 0xe8c860], [1, 0xd8b850]]);
  // 稻草人
  stack(cx - 2, ROAD_Y + 1, cz + 16, [[2, 0x8a6a3a]]);
  setBlock(cx - 2, ROAD_Y + 3, cz + 16, 0xf0c8a0);
  setBlock(cx - 1, ROAD_Y + 2, cz + 16, 0x8a6a3a); setBlock(cx + 1, ROAD_Y + 2, cz + 16, 0x8a6a3a);
  decoCube(cx - 2, ROAD_Y + 3.4, cz + 16, 0.25, 0x6a4a2a);
  // 更多作物行 + 水井
  for (let x = cx + 16; x <= cx + 26; x += 2) for (let z = cz - 14; z <= cz - 6; z += 2) decoCube(x, ROAD_Y + 0.4, z, 0.32, C.rice);
  stack(cx - 16, ROAD_Y + 1, cz + 14, [[3, 0x8a8a90]]);
  setBlock(cx - 16, ROAD_Y + 4, cz + 14, 0x6a7a8a); setBlock(cx - 16, ROAD_Y + 1, cz + 14, C.water, true);
  // 鸡舍 + 几只鸡
  stack(cx - 20, ROAD_Y + 1, cz - 8, [[2, C.planks], [1, C.roof]]);
  for (const [dx, dz] of [[-18, -6], [-17, -9], [-21, -7]]) {
    decoCube(cx + dx, ROAD_Y + 0.35, cz + dz, 0.25, 0xf0e0c0); decoCube(cx + dx, ROAD_Y + 0.55, cz + dz, 0.15, 0xe54848);
  }
}
function buildCountryTown(pt) {
  const { x: cx, z: cz } = pt;
  themePad(cx, cz, 32, 28, C.gravel);
  // 小镇街道十字
  for (let x = cx - 30; x <= cx + 30; x += 1) for (let z = cz - 3; z <= cz + 3; z += 1) setBlock(x, ROAD_Y, z, C.asphalt);
  for (let z = cz - 26; z <= cz + 26; z += 1) for (let x = cx - 3; x <= cx + 3; x += 1) setBlock(x, ROAD_Y, z, C.asphalt);
  const houses = [[-18,-14],[0,-16],[18,-12],[-20,12],[20,14],[0,16]];
  houses.forEach(([dx,dz], i) => themeHouse(cx + dx, cz + dz, 7, 6, 4, 0xf6f3e8, i === 2 ? 0xd86a4a : 0xb84a3a, C.glass));
  themeHouse(cx, cz, 9, 8, 5, 0xffffff, 0xc84a3a, C.glass); // 乘客3中心家
  for (const [dx,dz] of [[-28,-2],[-24,20],[26,-20],[28,2],[-8,24],[12,-24]]) fruitTree(cx + dx, cz + dz, (dx + dz) % 2 ? C.flowerRed : C.flowerYellow);
  for (let i = 0; i < 9; i += 1) placeThemePerson(cx - 24 + i * 6, cz + (i % 2 ? 7 : -7), C.neon[i % C.neon.length], '小镇居民');
  for (const [dx,dz,k] of [[-12,4,'cat'],[14,-5,'dog'],[24,6,'cat'],[-26,-5,'dog']]) placeThemeAnimal(k, cx + dx, cz + dz, hash3(cx + dx, 5, cz + dz));
  for (const [dx,dz] of [[-10,0],[10,0],[0,-10],[0,10]]) lampPost(cx + dx, ROAD_Y, cz + dz, C.lamp);
  // 中央广场喷泉（放在镇中心家以北的纵向街道上，避开建筑与车道）
  const fx = cx, fz = cz - 12;
  for (let r = 1; r <= 2; r += 1) {
    for (let a = 0; a < 8; a += 1) {
      const ang = a / 8 * Math.PI * 2;
      const px = Math.round(fx + Math.cos(ang) * r), pz = Math.round(fz + Math.sin(ang) * r);
      setBlock(px, ROAD_Y + 1, pz, 0xb8c0c8);
    }
  }
  setBlock(fx, ROAD_Y + 1, fz, C.water, true); setBlock(fx, ROAD_Y + 2, fz, 0x9aa0a8);
  decoCube(fx, ROAD_Y + 3, fz, 0.25, 0x9aa0a8);
  // 钟楼
  stack(cx - 26, ROAD_Y + 1, cz + 22, [[6, 0xcfcabf], [2, 0x8a5a3a]]);
  setBlock(cx - 26, ROAD_Y + 8, cz + 22, 0xf4d03f);
  // 集市摊位（彩色顶棚）
  for (const [dx, dz, col] of [[-14, 8, 0xe8a060], [14, 8, 0x6bb8d6], [-14, -8, 0xef6f6f]]) {
    stack(cx + dx, ROAD_Y + 1, cz + dz, [[1, col], [1, 0xf0eadc]]); setBlock(cx + dx, ROAD_Y + 3, cz + dz, col);
  }
  // 长椅 + 花箱
  for (const [dx, dz] of [[6, 6], [-6, 6], [6, -6], [-6, -6]]) { setBlock(cx + dx, ROAD_Y + 1, cz + dz, 0x6e5230); setBlock(cx + dx, ROAD_Y + 1, cz + dz + 1, 0x6e5230); }
  for (const [dx, dz] of [[-22, 6], [22, -6], [10, 18]]) {
    setBlock(cx + dx, ROAD_Y, cz + dz, 0x6e5230); decoCube(cx + dx, ROAD_Y + 0.5, cz + dz, 0.5, C.flowerRed); decoCube(cx + dx, ROAD_Y + 1.0, cz + dz, 0.3, C.flowerYellow);
  }
  // 街灯补齐
  for (const [dx, dz] of [[-18, -18], [18, 18], [-18, 18], [18, -18]]) lampPost(cx + dx, ROAD_Y, cz + dz, C.lamp);
}

// 自然植被：树木/花/灌木，远离路面缓冲带，临湖岸种柳树
function buildNature() {
  for (let x = -HALF + 2; x < HALF - 2; x += 1) {
    for (let z = -HALF + 2; z < HALF - 2; z += 1) {
      const distCenter = Math.sqrt(x * x + z * z);
      if (inLake(x, z)) continue; // 湖里不种
      // 桥面 + 两端引道范围内完全清除树木/植被，保证出租车通行
      const onBridgeZone = Math.abs(z) <= BRIDGE_Z_HALF + 2 && Math.abs(x) <= ELLIPSE_A + 2;
      if (onBridgeZone) continue;
      const r = hash3(x, 7, z) % 100;
      const gy = heightMap.get(`${x},${z}`) ?? 4;
      if (nearBranchOrTheme(x, z)) continue;
      // 椭圆公路缓冲带：距椭圆环近的不种
      const en = ellipseNorm(x, z);
      const nearRoad = Math.abs(en - 1) < 0.12; // 椭圆环附近
      if (nearRoad) {
        if (r < 25) decoCube(x, gy + 0.4, z, 0.3, C.flowerWhite);
        else if (r < 40) decoCube(x, gy + 0.4, z, 0.3, C.flowerYellow);
        continue;
      }
      // 湖岸（距湖近）种柳树/芦苇
      if (distCenter < LAKE_A + 4) {
        if (r < 25) plantWillow(x, gy, z);
        else if (r < 45) decoCube(x, gy + 0.5, z, 0.4, C.reed);
        continue;
      }
      // 三倍地图下控制树木密度，保持远景层次同时避免实例数过高
      if (r < 3) plantOakVariant(x, gy, z, C.oakWood, C.oakLeaves);
      else if (r < 5) plantSpruceVariant(x, gy, z);
      else if (r < 8) decoCube(x, gy + 0.4, z, 0.3, C.flowerRed);
    }
  }
}
function plantWillow(x, y, z) {
  const h = 3 + (hash3(x, y, z) % 2);
  for (let i = 1; i <= h; i += 1) {
    setBlock(x, y + i, z, i === h ? C.birchWood : C.oakWood);
    if (i === 2 && (hash3(x, y, z) % 3 === 0)) setBlock(x + 1, y + i, z, C.oakWood);
  }
  // 垂柳：上层紧凑、下层错落下垂，形成一点透视层次。
  const top = y + h;
  const leaves = [[0, 0, 2], [-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1], [-1, -1, 0], [1, 1, 0]];
  for (const [dx, dz, dy] of leaves) {
    if (!blocks.has(keyOf(x + dx, top + dy, z + dz))) setBlock(x + dx, top + dy, z + dz, C.birchLeaves);
    if (dy <= 1 && !blocks.has(keyOf(x + dx, top - 1, z + dz))) setBlock(x + dx, top - 1, z + dz, 0x7fbd55);
  }
  for (const [dx, dz] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) {
    if (!blocks.has(keyOf(x + dx, top, z + dz))) setBlock(x + dx, top, z + dz, C.birchLeaves);
  }
}

// ──────────────────────────────────────────────
// Zone builders
// ──────────────────────────────────────────────

// 通用：在某路段点附近放一根柱状物（多色方块堆叠）
function stack(x, y, z, parts) {
  let yy = y;
  for (const [h, col] of parts) { for (let i = 0; i < h; i += 1) { setBlock(x, yy, z, col); yy += 1; } }
  return yy;
}

// 居民楼（多色方块盒）
function building(bx, bz, by, w, d, h, color) {
  for (let x = 0; x < w; x += 1)
    for (let z = 0; z < d; z += 1)
      for (let y = 1; y <= h; y += 1) {
        const edge = x === 0 || x === w - 1 || z === 0 || z === d - 1;
        if (edge) setBlock(bx + x, by + y, bz + z, color);
        else if (y === h) setBlock(bx + x, by + y, bz + z, C.roof);
        else if ((x + z + y) % 3 === 0) setBlock(bx + x, by + y, bz + z, C.glass);
      }
}

function buildZoneCity() { /* 已由 buildNature 替代，保留空函数避免引用 */ }

function plantOakVariant(x, y, z, wood, leaf) {
  const h = 2 + (hash3(x, y, z) % 2);  // 矮树：2-3 格
  for (let i = 1; i <= h; i += 1) {
    setBlock(x, y + i, z, wood);
    if (i === 2 && hash3(x, i, z) % 4 === 0) setBlock(x - 1, y + i, z, wood);
  }
  canopy(x, y + h, z, leaf, 1);
}
function canopy(x, topY, z, leaf, r) {
  // 下宽上窄、前后错层，远看不再是规则正方体树冠。
  for (let dx = -r - 1; dx <= r + 1; dx += 1)
    for (let dz = -r - 1; dz <= r + 1; dz += 1) {
      const manhattan = Math.abs(dx) + Math.abs(dz);
      if (manhattan <= r + 1 && !blocks.has(keyOf(x + dx, topY, z + dz))) setBlock(x + dx, topY, z + dz, leaf);
      if (Math.abs(dx) <= r && Math.abs(dz) <= r && manhattan <= r + 1 && !blocks.has(keyOf(x + dx, topY + 1, z + dz))) setBlock(x + dx, topY + 1, z + dz, leaf);
    }
  if (!blocks.has(keyOf(x, topY + 2, z))) setBlock(x, topY + 2, z, 0x78b84a);
  if (!blocks.has(keyOf(x + 1, topY + 1, z - 1))) setBlock(x + 1, topY + 1, z - 1, 0x6fae44);
}
function lampPost(x, y, z, glow) {
  stack(x, y, z, [[4, C.concrete]]);
  const mat = new THREE.MeshStandardMaterial({ color: glow, emissive: glow, emissiveIntensity: 0.4 });
  const m = new THREE.Mesh(boxGeo, mat); m.position.set(x, y + 4.5, z);
  addDyn(m, { emissiveMat: mat, dayIntensity: 0.4, nightIntensity: 1.6 });
}
function trafficLight(x, y, z) {
  stack(x, y, z, [[5, 0x333333]]);
  setBlock(x, y + 6, z, 0x222222);
  // 三色灯
  const cols = [0xe54848, 0xf4d03f, 0x4caf6a];
  cols.forEach((c, i) => {
    const mat = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i === 2 ? 0.9 : 0.1 });
    const m = new THREE.Mesh(boxGeo, mat); m.position.set(x, y + 6, z + (i - 1) * 0 + 0); m.position.y = y + 5 + i * 0.6;
    addDyn(m, { emissiveMat: mat, dayIntensity: i === 2 ? 0.9 : 0.1, nightIntensity: i === 2 ? 1.2 : 0.15 });
  });
}
function crosswalk(x, z) {
  for (let i = -ROAD_HALF_W; i <= ROAD_HALF_W; i += 1) {
    setBlock(x + i, heightAt(x + i, z), z, i % 2 === 0 ? 0xf0f0f0 : C.road);
  }
}
function footBridge(x, z) {
  // 跨路小拱桥（人行天桥）
  const gy = heightAt(x, z);
  for (let i = -ROAD_HALF_W - 1; i <= ROAD_HALF_W + 1; i += 1) {
    setBlock(x + i, gy + 4, z, C.concrete);
  }
  setBlock(x - ROAD_HALF_W - 2, gy + 1, z, C.concrete);
  setBlock(x - ROAD_HALF_W - 2, gy + 2, z, C.concrete);
  setBlock(x - ROAD_HALF_W - 2, gy + 3, z, C.concrete);
  setBlock(x + ROAD_HALF_W + 2, gy + 1, z, C.concrete);
  setBlock(x + ROAD_HALF_W + 2, gy + 2, z, C.concrete);
  setBlock(x + ROAD_HALF_W + 2, gy + 3, z, C.concrete);
}
function signPost(x, y, z, zone) {
  let pole, plate;
  if (zone === 'city') { pole = C.signCity; plate = 0xffffff; }
  else if (zone === 'forest') { pole = C.signForest; plate = C.signForest; }
  else { pole = C.signLake; plate = C.signLake; }
  stack(x, y, z, [[3, pole]]);
  setBlock(x, y + 3, z, plate);
  setBlock(x, y + 4, z, plate);
}

function buildZoneForest() { /* 已由 buildNature 替代 */ }
function plantSpruceVariant(x, y, z) {
  const h = 3 + (hash3(x, y, z) % 3);  // 矮松：3-5 格
  for (let i = 1; i <= h; i += 1) setBlock(x, y + i, z, C.spruceWood);
  for (let layer = 0; layer < 3; layer += 1) {
    const ly = y + h - layer;
    const r = 1 + (layer === 2 ? 1 : 0);
    for (let dx = -r; dx <= r; dx += 1)
      for (let dz = -r; dz <= r; dz += 1)
        if (Math.abs(dx) + Math.abs(dz) <= r + 1 && !blocks.has(keyOf(x + dx, ly, z + dz)))
          setBlock(x + dx, ly, z + dz, layer === 0 ? 0x3f7a42 : C.spruceLeaves);
  }
  if (!blocks.has(keyOf(x, y + h + 1, z))) setBlock(x, y + h + 1, z, 0x4f8a4a);
}

function buildZoneLake() { /* 已由 buildNature 替代 */ }
function plantPalmVariant(x, y, z) {
  const h = 2;  // 矮棕榈
  for (let i = 1; i <= h; i += 1) setBlock(x, y + i, z, C.palmWood);
  const top = y + h;
  for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1], [0, 0]]) {
    if (!blocks.has(keyOf(x + dx, top + 1, z + dz))) setBlock(x + dx, top + 1, z + dz, C.palmLeaves);
  }
}
function archBridge(x, z) {
  const gy = heightAt(x, z);
  for (let i = -ROAD_HALF_W - 1; i <= ROAD_HALF_W + 1; i += 1) {
    setBlock(x + i, gy, z, 0xf0f0f5);
    setBlock(x + i, gy + 1, z, 0xf0f0f5); // 拱
  }
}
let boatMesh = null;
function spawnBoat() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xf0f0f5 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 3), mat); hull.position.y = 0.3;
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 1.5), new THREE.MeshLambertMaterial({ color: 0xef6f6f })); top.position.set(0, 0.6, -0.3);
  g.add(hull, top);
  g.position.set(0, 3.2, 0); // 湖中央
  addDyn(g, { isBoat: true });
  boatMesh = g;
}

function buildZoneField() { /* 已由 buildNature 替代 */ }
function windmill(x, y, z) {
  stack(x, y, z, [[6, C.concrete]]);
  const hub = new THREE.Group();
  hub.position.set(x, y + 5, z + 0.6);
  const bladeMat = new THREE.MeshLambertMaterial({ color: 0xf0f0f0 });
  for (let i = 0; i < 4; i += 1) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3, 0.3), bladeMat);
    b.position.y = 1.5; b.rotation.z = (i * Math.PI) / 2;
    hub.add(b);
  }
  addDyn(hub, { isWindmill: true });
}

// ──────────────────────────────────────────────
// Clouds
// ──────────────────────────────────────────────

const clouds = [];
(function makeClouds() {
  const mat = new THREE.MeshLambertMaterial({ color: C.cloud, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 9; i += 1) {
    const g = new THREE.Group();
    const n = 4 + Math.floor(Math.random() * 5);
    for (let k = 0; k < n; k += 1) {
      const m = new THREE.Mesh(boxGeo, mat);
      m.position.set((Math.random() - 0.5) * 6, Math.random() * 1.2, (Math.random() - 0.5) * 5);
      m.scale.setScalar(1.6 + Math.random() * 1.4);
      g.add(m);
    }
    g.position.set((Math.random() - 0.5) * SIZE, 36 + Math.random() * 10, (Math.random() - 0.5) * SIZE);
    g.userData.speed = 0.3 + Math.random() * 0.4;
    scene.add(g); clouds.push(g);
  }
})();

// ──────────────────────────────────────────────
// Player (foot)
// ──────────────────────────────────────────────

const player = {
  pos: new THREE.Vector3(0, 6, 0), vel: new THREE.Vector3(),
  yaw: 0, pitch: 0, onGround: false, height: 1.8, radius: 0.3, eye: 1.8,
};
const keys = {};
let locked = false, started = false, mode = 'foot';
let gameMode = 'free'; // 'free' | 'timed'

function collidesAt(px, py, pz) {
  const r = player.radius, h = player.height;
  const x0 = cell(px - r), x1 = cell(px + r);
  const y0 = cell(py + 0.15), y1 = cell(py + h - 0.001);
  const z0 = cell(pz - r), z1 = cell(pz + r);
  for (let x = x0; x <= x1; x += 1)
    for (let y = y0; y <= y1; y += 1)
      for (let z = z0; z <= z1; z += 1)
        if (isSolid(x, y, z)) return true;
  return false;
}
function footInWater() { return isWater(cell(player.pos.x), cell(player.pos.y + 0.4), cell(player.pos.z)); }
function moveAxis(dx, dy, dz) {
  const nx = player.pos.x + dx, ny = player.pos.y + dy, nz = player.pos.z + dz;
  if (collidesAt(nx, ny, nz)) return false;
  player.pos.set(nx, ny, nz); return true;
}
function updateFoot(dt) {
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  if (started) {
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
    // 水平移动：遇 1 格台阶自动爬上，保证山坡/路沿行动自如
    const stepMove = (dx, dz) => {
      if (moveAxis(dx, 0, dz)) return true;
      // 尝试抬高 1.05 格再移（自动上台阶）
      const oldY = player.pos.y;
      player.pos.y += 1.05;
      const ok = moveAxis(dx, 0, dz);
      if (!ok) player.pos.y = oldY;
      return ok;
    };
    stepMove(move.x * dt, 0); stepMove(0, move.z * dt);
    const falling = player.vel.y < 0;
    if (!moveAxis(0, player.vel.y * dt, 0)) { if (falling) player.onGround = true; player.vel.y = 0; }
    else player.onGround = false;
    if (player.pos.y < -20) { const r = safeSpawn(); player.pos.set(r.x, r.y, r.z); player.vel.set(0, 0, 0); }
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
    if (!blocks.has(keyOf(nx, ny, nz)) && !overlapsPlayer(nx, ny, nz)) { setBlock(nx, ny, nz, C.planks); rebuildInstances(); gov.placed += 1; }
  }
}

// ──────────────────────────────────────────────
// Taxi (player-driven)
// ──────────────────────────────────────────────

const taxi = { pos: new THREE.Vector3(), heading: 0, speed: 0, mesh: new THREE.Group() };
const driveLookTarget = new THREE.Vector3();
let steeringWheel = null;
let steeringWheelAngle = 0;
let driveSteerVisual = 0;
let driveSteerInput = 0;     // 平滑后的转向输入，让方向盘转动更顺滑
let speedoNeedle = null;     // 仪表盘车速指针
let driveCamReady = false;
let driveView = 'chase';   // 'chase' 跟车尾 | 'top' 俯视
let autoDrive = false;     // 自动驾驶（沿椭圆公路，送达后过桥去对岸）
let autoTargetIdx = 0;     // 自动驾驶目标路点索引
let autoBridgePath = [];   // 送客完成后的过桥路径
let autoBridgeIdx = 0;
let autoBridgeResume = false;
let autoTaskPath = [];     // 接到乘客后的分支目的地路径
let autoTaskIdx = 0;
let autoStuckTimer = 0;    // 自动驾驶卡顿计时：持续低速/无明显位移则重规划
let autoLastPos = new THREE.Vector3();
let manualForwardHold = 0;  // 手动驾驶长按 W 计时
let manualBoostShown = false;
function buildTaxiMesh() {
  const g = taxi.mesh;
  const bodyMat = new THREE.MeshLambertMaterial({ color: C.taxiBody });
  const winMat = new THREE.MeshLambertMaterial({ color: C.taxiWindow, transparent: true, opacity: 0.65 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const chromeMat = new THREE.MeshLambertMaterial({ color: 0xcccccc });
  // 车身底盘
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 2.9), bodyMat); body.position.y = 0.5;
  // 车顶
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.45, 1.5), bodyMat); roof.position.set(0, 1.0, -0.1);
  // 车窗（环绕车顶四面）
  const winFront = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.42, 0.05), winMat); winFront.position.set(0, 1.0, 0.78);
  const winBack = winFront.clone(); winBack.position.z = -0.78;
  const winL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 1.4), winMat); winL.position.set(0.78, 1.0, -0.1);
  const winR = winL.clone(); winR.position.x = -0.78;
  // 前大灯
  const headMat = new THREE.MeshStandardMaterial({ color: C.taxiLight, emissive: 0xfff0a0, emissiveIntensity: 0.7 });
  const hl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.08), headMat); hl.position.set(-0.5, 0.55, 1.46);
  const hr = hl.clone(); hr.position.x = 0.5;
  // 尾灯（红）
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xe54848, emissive: 0xe54848, emissiveIntensity: 0.5 });
  const tl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.06), tailMat); tl.position.set(-0.5, 0.6, -1.46);
  const tr = tl.clone(); tr.position.x = 0.5;
  // 前后保险杠
  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 0.15), chromeMat); bumperF.position.set(0, 0.35, 1.5);
  const bumperB = bumperF.clone(); bumperB.position.z = -1.5;
  // 车顶 TAXI 牌
  const signMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd23f, emissiveIntensity: 0.4 });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.35), signMat); sign.position.set(0, 1.35, -0.1);
  // ── 车内设施：模仿真实车内（仪表台·双座椅·中控·档把·后视镜·门板·方向盘·司机）──
  const interiorMat = new THREE.MeshLambertMaterial({ color: 0x23232a });
  const trimMat = new THREE.MeshLambertMaterial({ color: 0x3a3a46 });
  const seatMat = new THREE.MeshLambertMaterial({ color: 0x2a2a32 });
  const seatTrim = new THREE.MeshLambertMaterial({ color: 0x474754 });
  const chromeTrim = new THREE.MeshLambertMaterial({ color: 0xb8b8c0 });
  // 仪表台本体
  const dash = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.24, 0.36), interiorMat); dash.position.set(0, 0.84, 0.66);
  // 仪表盘背板 + 车速表盘 + 指针（指针随车速转动）
  const cluster = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.24, 0.06), new THREE.MeshLambertMaterial({ color: 0x0e0e12 })); cluster.position.set(0.34, 0.97, 0.5);
  const speedo = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, 6, 16), new THREE.MeshLambertMaterial({ color: 0x6a6a78 })); speedo.position.set(0.34, 0.97, 0.54);
  const needleGeo = new THREE.BoxGeometry(0.018, 0.16, 0.018); needleGeo.translate(0, 0.07, 0);
  const needle = new THREE.Mesh(needleGeo, new THREE.MeshStandardMaterial({ color: 0xff5a5a, emissive: 0xff5a5a, emissiveIntensity: 0.9 })); needle.position.set(0.34, 0.97, 0.555);
  speedoNeedle = needle;
  // 中控屏 + 两个出风口
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.05), new THREE.MeshStandardMaterial({ color: 0x0a1a2a, emissive: 0x1a3a5a, emissiveIntensity: 0.5 })); screen.position.set(-0.14, 0.97, 0.52);
  const ventL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.04), trimMat); ventL.position.set(-0.46, 0.98, 0.52);
  const ventR = ventL.clone(); ventR.position.x = 0.62;
  // 中控台 + 档把
  const consoleBox = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.5), interiorMat); consoleBox.position.set(0, 0.62, 0.18);
  const shifter = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.06), chromeTrim); shifter.position.set(0.04, 0.78, 0.26);
  const shifterKnob = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.1), new THREE.MeshLambertMaterial({ color: 0x1a1a1a })); shifterKnob.position.set(0.04, 0.9, 0.26);
  // 双前座椅（带头枕）+ 后排长椅
  const seatL = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.16, 0.46), seatMat); seatL.position.set(-0.34, 0.62, -0.16);
  const seatBackL = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.5, 0.16), seatMat); seatBackL.position.set(-0.34, 0.86, -0.36); seatBackL.rotation.x = -0.12;
  const headrestL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.16), seatTrim); headrestL.position.set(-0.34, 1.12, -0.36);
  const seatR = seatL.clone(); seatR.position.x = 0.34;
  const seatBackR = seatBackL.clone(); seatBackR.position.x = 0.34;
  const headrestR = headrestL.clone(); headrestR.position.x = 0.34;
  const rearBench = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.16, 0.42), seatMat); rearBench.position.set(0, 0.62, -1.0);
  const rearBack = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.46, 0.16), seatMat); rearBack.position.set(0, 0.84, -1.2); rearBack.rotation.x = -0.1;
  // 门板（左右）+ 把手
  const doorL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.9), interiorMat); doorL.position.set(-0.78, 0.7, -0.1);
  const doorR = doorL.clone(); doorR.position.x = 0.78;
  const handleL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.16), chromeTrim); handleL.position.set(-0.75, 0.78, 0.2);
  const handleR = handleL.clone(); handleR.position.x = 0.75;
  // 车内后视镜
  const rearMirror = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.05), new THREE.MeshLambertMaterial({ color: 0x111114 })); rearMirror.position.set(0, 1.22, 0.55);
  // 方向盘：轮缘+中心毂+辐条+司机双手/前臂（双手作为子物体随方向盘一起转动）
  const wheelGroup = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.026, 10, 28), darkMat); rim.rotation.x = Math.PI / 2;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12), chromeTrim); hub.rotation.x = Math.PI / 2;
  const spokeH = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.04), darkMat);
  const spokeV = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.32, 0.04), darkMat);
  const handMat = new THREE.MeshLambertMaterial({ color: C.skin });
  const sleeveMat = new THREE.MeshLambertMaterial({ color: 0x35507a });
  const forearmL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.3), sleeveMat); forearmL.position.set(-0.18, 0, -0.16); forearmL.rotation.x = -0.2;
  const forearmR = forearmL.clone(); forearmR.position.x = 0.18;
  const handL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.1), handMat); handL.position.set(-0.2, 0, 0.03);
  const handR = handL.clone(); handR.position.x = 0.2;
  wheelGroup.add(rim, hub, spokeH, spokeV, forearmL, forearmR, handL, handR);
  wheelGroup.position.set(-0.34, 0.96, 0.5); wheelGroup.rotation.x = -0.62;
  steeringWheel = wheelGroup;
  // 方向盘转向柱（连到仪表台，固定不随轮转动）
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8), trimMat); column.position.set(-0.34, 0.86, 0.42); column.rotation.x = -0.62;
  // ── 司机人物（细节）：制服上身、白衬衣领、头、黄色司机帽、双眼、上臂前伸搭向方向盘 ──
  const driver = new THREE.Group(); driver.position.set(-0.34, -0.08, -0.2); driver.scale.setScalar(0.85);
  const dSkin = new THREE.MeshLambertMaterial({ color: C.skin });
  const dShirt = new THREE.MeshLambertMaterial({ color: 0x35507a });
  const dTorso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.26), dShirt); dTorso.position.set(0, 1.0, -0.02); dTorso.rotation.x = -0.2;
  const dCollar = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.06), new THREE.MeshLambertMaterial({ color: 0xffffff })); dCollar.position.set(0, 1.18, 0.1);
  const dNeck = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.13), dSkin); dNeck.position.set(0, 1.22, -0.04);
  const dHead = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), dSkin); dHead.position.set(0, 1.4, -0.05); dHead.rotation.x = -0.12;
  const dHair = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.32), new THREE.MeshLambertMaterial({ color: C.hair })); dHair.position.set(0, 1.54, -0.06);
  const dCap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.34), new THREE.MeshLambertMaterial({ color: 0xffd23f })); dCap.position.set(0, 1.57, -0.06);
  const dBrim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.12), new THREE.MeshLambertMaterial({ color: 0xffd23f })); dBrim.position.set(0, 1.55, 0.08);
  const dEye = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.02), new THREE.MeshLambertMaterial({ color: 0x222222 })); dEye.position.set(-0.07, 1.4, 0.1);
  const dEye2 = dEye.clone(); dEye2.position.x = 0.07;
  const dArmGeo = new THREE.BoxGeometry(0.12, 0.12, 0.3);
  const dArmL = new THREE.Mesh(dArmGeo, dShirt); dArmL.position.set(-0.18, 1.04, 0.16); dArmL.rotation.x = -1.05;
  const dArmR = new THREE.Mesh(dArmGeo, dShirt); dArmR.position.set(0.18, 1.04, 0.16); dArmR.rotation.x = -1.05;
  // 下半身：腰 + 双腿 + 脚（车内视角可见自己的身体与搭在方向盘上的双手）
  const dPants = new THREE.MeshLambertMaterial({ color: 0x2a3a55 });
  const dShoe = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const dHips = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.26), dPants); dHips.position.set(0, 0.74, -0.08);
  const dThighGeo = new THREE.BoxGeometry(0.13, 0.3, 0.16);
  const dThighL = new THREE.Mesh(dThighGeo, dPants); dThighL.position.set(-0.1, 0.55, -0.06); dThighL.rotation.x = 0.35;
  const dThighR = new THREE.Mesh(dThighGeo, dPants); dThighR.position.set(0.1, 0.55, -0.06); dThighR.rotation.x = 0.35;
  const dShinGeo = new THREE.BoxGeometry(0.12, 0.3, 0.15);
  const dShinL = new THREE.Mesh(dShinGeo, dPants); dShinL.position.set(-0.1, 0.28, 0.16); dShinL.rotation.x = -0.9;
  const dShinR = new THREE.Mesh(dShinGeo, dPants); dShinR.position.set(0.1, 0.28, 0.16); dShinR.rotation.x = -0.9;
  const dFootL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.22), dShoe); dFootL.position.set(-0.1, 0.16, 0.32);
  const dFootR = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.22), dShoe); dFootR.position.set(0.1, 0.16, 0.32);
  driver.add(dTorso, dCollar, dNeck, dHead, dHair, dCap, dBrim, dEye, dEye2, dArmL, dArmR,
    dHips, dThighL, dThighR, dShinL, dShinR, dFootL, dFootR);
  // 后视镜
  const mirrorL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.18), darkMat); mirrorL.position.set(0.85, 0.95, 0.6);
  const mirrorR = mirrorL.clone(); mirrorR.position.x = -0.85;
  // 车轮
  const wheelGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.25, 14);
  const hubGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.27, 8);
  const hubMat = new THREE.MeshLambertMaterial({ color: 0x999999 });
  for (const [wx, wz] of [[-0.8, 0.95], [0.8, 0.95], [-0.8, -0.95], [0.8, -0.95]]) {
    const w = new THREE.Mesh(wheelGeo, darkMat); w.rotation.z = Math.PI / 2; w.position.set(wx, 0.33, wz);
    const hub = new THREE.Mesh(hubGeo, hubMat); hub.rotation.z = Math.PI / 2; hub.position.set(wx, 0.33, wz);
    g.add(w, hub);
  }
  g.add(body, roof, winFront, winBack, winL, winR, hl, hr, tl, tr, bumperF, bumperB, sign,
    dash, cluster, speedo, needle, screen, ventL, ventR, consoleBox, shifter, shifterKnob,
    seatL, seatBackL, headrestL, seatR, seatBackR, headrestR, rearBench, rearBack,
    doorL, doorR, handleL, handleR, rearMirror, column, wheelGroup, mirrorL, mirrorR, driver);
  scene.add(g);
}
function placeTaxiAtStation() {
  const s = routePoints[0];
  const next = routePoints[1] || { x: s.x, z: s.z + 1 };
  // 出生在场站路面中心正上方；强制整平出生格为沥青，确保车在路上
  for (let dx = -ROAD_HALF_W; dx <= ROAD_HALF_W; dx += 1)
    for (let dz = -ROAD_HALF_W; dz <= ROAD_HALF_W; dz += 1) {
      flattenColumn(s.x + dx, s.z + dz, ROAD_Y);
      setBlock(s.x + dx, ROAD_Y, s.z + dz, C.asphalt);
      for (let dy = 1; dy <= 4; dy += 1) delBlock(s.x + dx, ROAD_Y + dy, s.z + dz);
    }
  rebuildInstances();
  taxi.pos.set(s.x, ROAD_Y + 0.6, s.z);
  taxi.heading = Math.atan2(next.x - s.x, next.z - s.z);
  taxi.speed = 0;
  taxi.mesh.position.copy(taxi.pos); taxi.mesh.rotation.y = taxi.heading;
}
function nearDriveRoute(x, z) {
  const mainRoad = Math.abs(ellipseNorm(x, z) - 1) < 0.055;
  if (mainRoad) return true;
  for (const br of branchRoutes) {
    for (const p of br.points) if (Math.hypot(p.x - x, p.z - z) <= ROAD_HALF_W + 4) return true;
  }
  return false;
}
// 是否在公路路面内（主环线/分支路/中央桥），用路面半宽判定 —— 自动驾驶硬约束于此，确保仅在公路上行驶。
function onRoad(x, z) {
  // 中央车行桥：|z|<=桥面半宽 且 |x|<=椭圆半轴
  if (Math.abs(z) <= BRIDGE_Z_HALF + 0.5 && Math.abs(x) <= ELLIPSE_A + 0.5) return true;
  // 主环线：距椭圆环中心线 <= 路面半宽
  if (Math.abs(ellipseNorm(x, z) - 1) * Math.min(ELLIPSE_A, ELLIPSE_B) <= ROAD_HALF_W + 0.5) return true;
  // 分支路：距任一分支路点连线 <= 路面半宽
  for (const br of branchRoutes) {
    for (let i = 0; i < br.points.length - 1; i += 1) {
      const a = br.points[i], b = br.points[i + 1];
      const abx = b.x - a.x, abz = b.z - a.z;
      const len2 = abx * abx + abz * abz || 1e-6;
      let t = ((x - a.x) * abx + (z - a.z) * abz) / len2;
      t = Math.max(0, Math.min(1, t));
      if (Math.hypot(a.x + abx * t - x, a.z + abz * t - z) <= ROAD_HALF_W + 0.5) return true;
    }
  }
  return false;
}
function carBlocked(x, z) {
  const cx = cell(x), cz = cell(z);
  const gy = Math.round(heightAt(x, z));
  const onTaxiBridge = Math.abs(cz) <= BRIDGE_Z_HALF && Math.abs(cx) <= ELLIPSE_A;
  const onDriveRoute = onTaxiBridge || nearDriveRoute(x, z);
  if (heightAt(x, z) < 2) return true;
  // 水面阻挡（桥面/车道例外，避免大地图道路边缘被地形或水误判卡住）
  if (!onDriveRoute && (isWater(cx, gy, cz) || isWater(cx, gy + 1, cz))) return true;
  // 主路、分支路、中央桥都是可通行车道；只让挡路动物临时拦车。
  if (onDriveRoute) return animalBlocking(x, z);
  // 挡住前方比当前车格高 2 格以上的陡崖/山体（避免嵌进山侧面）
  const curGy = Math.round(heightAt(taxi.pos.x, taxi.pos.z));
  if (gy - curGy >= 2) return true;
  // 挡路动物：blocking 状态时不可通行
  if (animalBlocking(x, z)) return true;
  // 挡车顶以上的高大实体（建筑/大树冠），允许碾压草地、矮树、花
  return isSolid(cx, gy + 3, cz);
}
function updateDrive(dt) {
  if (autoDrive) {
    // 自动驾驶：沿椭圆公路路点行驶
    autoSteer(dt);
  } else {
    const forwardHeld = keys['KeyW'] && !keys['KeyS'];
    if (forwardHeld) manualForwardHold += dt;
    else { manualForwardHold = 0; manualBoostShown = false; }
    const boost = manualForwardHold >= 3;
    if (boost && !manualBoostShown) { manualBoostShown = true; toast('出租车加速', '长按 W 3 秒，加速已启动', 'good'); }
    // 渐进式加速：朝目标速度平滑过渡，起步柔和、接近极速自然放缓（不再瞬时拉满）
    const maxFwd = boost ? 13 : 8, maxRev = 5;
    const accelInput = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
    let target;
    if (accelInput > 0) target = maxFwd;
    else if (accelInput < 0) target = -maxRev;
    else target = 0;
    const accelRate = accelInput !== 0 ? (boost ? 1.05 : 0.78) : 1.7; // 松油门较快滑行回零
    taxi.speed += (target - taxi.speed) * Math.min(1, dt * accelRate);
    if (keys['Space']) taxi.speed += (0 - taxi.speed) * Math.min(1, dt * 7); // 手刹快速减速
    if (Math.abs(taxi.speed) > 0.15) {
      const steerInput = (keys['KeyA'] ? 1 : 0) - (keys['KeyD'] ? 1 : 0);
      // 转向输入平滑：响应更快但不瞬切，方向盘连续柔顺地转到目标角度
      driveSteerInput += (steerInput - driveSteerInput) * Math.min(1, dt * 12);
      driveSteerVisual = driveSteerInput;
      const speedFactor = 0.55 + Math.min(1, Math.abs(taxi.speed) / 10) * 0.45;
      taxi.heading += driveSteerInput * 1.05 * speedFactor * dt * Math.sign(taxi.speed);
    } else { driveSteerInput += (0 - driveSteerInput) * Math.min(1, dt * 12); driveSteerVisual = driveSteerInput; }
  }
  const fwd = new THREE.Vector3(Math.sin(taxi.heading), 0, Math.cos(taxi.heading));
  const mv = fwd.clone().multiplyScalar(taxi.speed * dt);
  const tryX = taxi.pos.x + mv.x, tryZ = taxi.pos.z + mv.z;
  if (!carBlocked(tryX, taxi.pos.z)) taxi.pos.x = tryX; else taxi.speed *= 0.4;
  if (!carBlocked(taxi.pos.x, tryZ)) taxi.pos.z = tryZ; else taxi.speed *= 0.4;
  taxi.pos.x = Math.max(-HALF + 1, Math.min(HALF - 1, taxi.pos.x));
  taxi.pos.z = Math.max(-HALF + 1, Math.min(HALF - 1, taxi.pos.z));
  // 自动驾驶硬约束：车必须在公路路面内，偏离则拉回最近路面中线（仅在公路上行驶）。
  if (autoDrive && !onRoad(taxi.pos.x, taxi.pos.z)) {
    const seg = nearestRoadSegment();
    if (seg) {
      taxi.pos.x += (seg.px - taxi.pos.x) * Math.min(1, dt * 10);
      taxi.pos.z += (seg.pz - taxi.pos.z) * Math.min(1, dt * 10);
      taxi.speed *= 0.6;
    }
  }
  const zone = zoneAt(taxi.pos.x, taxi.pos.z);
  // 车 y 强制贴方块顶面：每帧兜底校正，避免任何情况下掉到地面以下。
  const groundY = heightAt(taxi.pos.x, taxi.pos.z) + 0.62;
  if (!Number.isFinite(taxi.pos.y) || taxi.pos.y < groundY - 0.05 || taxi.pos.y < 0) taxi.pos.y = groundY;
  else taxi.pos.y += (groundY - taxi.pos.y) * Math.min(1, dt * 8);
  taxi.mesh.position.copy(taxi.pos); taxi.mesh.rotation.y = taxi.heading;
  if (speedoNeedle) speedoNeedle.rotation.z = Math.max(-1.3, Math.min(1.3, -taxi.speed * 0.085));
  updateSteeringWheel(dt);
  // 视角：俯视 / 车内方向盘 / 跟车尾。镜头位置/看点都做缓动，转弯不再突然甩动。
  const camAlpha = Math.min(1, dt * 4.2);
  const lookAlpha = Math.min(1, dt * 5.5);
  let desiredCam, desiredLook;
  if (driveView === 'top') {
    desiredCam = new THREE.Vector3(taxi.pos.x, taxi.pos.y + 24, taxi.pos.z - 0.01);
    desiredLook = new THREE.Vector3(taxi.pos.x, taxi.pos.y, taxi.pos.z);
  } else if (driveView === 'cockpit') {
    // 司机眼部位置，略向前略低，看向远方稍下：方向盘、双手、双腿都在画面下方可见。
    desiredCam = taxi.mesh.localToWorld(new THREE.Vector3(-0.34, 1.14, 0.02));
    desiredLook = taxi.mesh.localToWorld(new THREE.Vector3(-0.12, 0.92, 8));
  } else {
    const camOff = fwd.clone().multiplyScalar(-10).add(new THREE.Vector3(0, 6.2, 0));
    desiredCam = new THREE.Vector3().copy(taxi.pos).add(camOff);
    desiredLook = new THREE.Vector3().copy(taxi.pos).add(fwd.clone().multiplyScalar(7)).add(new THREE.Vector3(0, 1.4, 0));
  }
  if (driveView === 'cockpit') {
    // 车内视角：相机刚性固定在司机眼部，内饰（仪表台/座椅/身体/门板）保持静止，
    // 仅车外风景随行驶流动、方向盘与手臂随转向转动 —— 其它一律固定。
    camera.position.copy(desiredCam);
    driveLookTarget.copy(desiredLook);
    driveCamReady = true;
  } else if (!driveCamReady) {
    camera.position.copy(desiredCam);
    driveLookTarget.copy(desiredLook);
    driveCamReady = true;
  } else {
    camera.position.lerp(desiredCam, camAlpha);
    driveLookTarget.lerp(desiredLook, lookAlpha);
  }
  camera.lookAt(driveLookTarget);
  rideLogic(dt);
  updateZoneAmbience(zone, dt);
}

function updateSteeringWheel(dt) {
  if (!steeringWheel) return;
  const target = Math.max(-1, Math.min(1, driveSteerVisual)) * 0.95;
  steeringWheelAngle += (target - steeringWheelAngle) * Math.min(1, dt * 16);
  steeringWheel.rotation.z = steeringWheelAngle;
}
function nearestRouteIdx(x = taxi.pos.x, z = taxi.pos.z) {
  let bestIdx = 0, bestD = Infinity;
  for (let i = 0; i < routePoints.length; i += 1) {
    const d = Math.hypot(routePoints[i].x - x, routePoints[i].z - z);
    if (d < bestD) { bestD = d; bestIdx = i; }
  }
  return bestIdx;
}
function steerToward(tgt, dt, cruise = 6) {
  const desired = Math.atan2(tgt.x - taxi.pos.x, tgt.z - taxi.pos.z);
  let diff = desired - taxi.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  driveSteerVisual = Math.max(-1, Math.min(1, diff / 0.8));
  // 自动驾驶降低急转角速度，避免过冲冲出道路；急转弯时自动减速。
  const maxTurn = 1.25 * dt;
  taxi.heading += Math.max(-maxTurn, Math.min(maxTurn, diff));
  const cornerSlow = Math.min(1, Math.abs(diff) / 0.9);
  const targetSpeed = cruise * (1 - cornerSlow * 0.7);
  taxi.speed += (targetSpeed - taxi.speed) * Math.min(1, dt * 3);
  taxi.speed = Math.max(0, Math.min(cruise, taxi.speed));
}
// 拟人自动驾驶转向（纯追踪 + 弯道预判）：
// - 朝前方一段距离的瞄准点转向（看远不看近），方向盘渐进平滑转动
// - 进弯前按前方曲率预判减速、出弯加速，速度连续变化
// - 大角度掉头走小半径弧线（低速+大转向），而非停车原地转
function steerAutoSafe(tgt, dt, cruise = 5.5) {
  const desired = Math.atan2(tgt.x - taxi.pos.x, tgt.z - taxi.pos.z);
  let diff = desired - taxi.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const absDiff = Math.abs(diff);

  // 方向盘：渐进平滑打方向（像真人连续转动方向盘），而非瞬切到目标角度
  const steerTarget = Math.max(-1, Math.min(1, diff / 0.7));
  driveSteerInput += (steerTarget - driveSteerInput) * Math.min(1, dt * 5);
  driveSteerVisual = driveSteerInput;
  // 转向角速度：随方向盘输入连续变化，弯越急转得越快，但有上限避免甩动
  const maxTurn = (0.9 + Math.abs(driveSteerInput) * 1.5) * dt;
  taxi.heading += Math.max(-maxTurn, Math.min(maxTurn, diff));

  // 速度：按当前转向偏差 + 前瞻曲率连续减速，进弯柔减速、出弯柔加速
  // absDiff 大＝正在过急弯/掉头，降速；接近 0＝直道，恢复巡航
  let targetSpeed;
  if (absDiff > 2.4) targetSpeed = cruise * 0.12;              // 掉头：极低速弧线
  else if (absDiff > 1.2) targetSpeed = cruise * 0.32;         // 急弯：低速
  else targetSpeed = cruise * (1 - Math.min(1, absDiff / 1.2) * 0.6);
  // 制动/加速速率：减速比加速快（真人踩刹车更果断），低速掉头时更跟手
  const rate = targetSpeed < taxi.speed ? 4 : 2.2;
  taxi.speed += (targetSpeed - taxi.speed) * Math.min(1, dt * rate);
  taxi.speed = Math.max(0, Math.min(cruise, taxi.speed));
}
// 自动驾驶贴中线：在环线或当前分支路上找最近线段，把车横向位置向中线投影点缓动拉近，使车尽量行驶在路中央。
function nearestRoadSegment() {
  let best = null, bestDist = Infinity;
  const consider = (a, b) => {
    const abx = b.x - a.x, abz = b.z - a.z;
    const len2 = abx * abx + abz * abz || 1e-6;
    let t = ((taxi.pos.x - a.x) * abx + (taxi.pos.z - a.z) * abz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + abx * t, pz = a.z + abz * t;
    const d = Math.hypot(px - taxi.pos.x, pz - taxi.pos.z);
    if (d < bestDist) { bestDist = d; best = { px, pz, tx: abx, tz: abz, len: Math.sqrt(len2) }; }
  };
  // 过桥路径线段（autoBridgePath 沿 z=0 桥面）一并参与最近判定，保证车在桥上贴桥面中线
  if (autoBridgePath.length > 1) {
    for (let i = 0; i < autoBridgePath.length - 1; i += 1) consider(autoBridgePath[i], autoBridgePath[i + 1]);
  }
  // 环线相邻路点
  const n = routePoints.length;
  for (let i = 0; i < n; i += 1) consider(routePoints[i], routePoints[(i + 1) % n]);
  // 分支路点
  for (const br of branchRoutes) for (let i = 0; i < br.points.length - 1; i += 1) consider(br.points[i], br.points[i + 1]);
  return best;
}
// 计算车相对道路中线的横向偏离，返回一个"瞄准点"：在中线前方一段距离处，叠加横向偏离的回中修正，
// 供 steerAutoSafe 用方向盘把车自然转回中线（不硬拉位置）。
function aimPointForCenter() {
  const seg = nearestRoadSegment();
  if (!seg) return null;
  // 中线切线方向（归一化）
  const tlen = seg.len || 1;
  const tnx = seg.tx / tlen, tnz = seg.tz / tlen;
  // 横向（法向）：切线旋转 90°
  const nx = -tnz, nz = tnx;
  // 车到中线的横向偏离（带符号，法向投影）
  const off = (taxi.pos.x - seg.px) * nx + (taxi.pos.z - seg.pz) * nz;
  // 瞄准点 = 中线前方 lookAhead 处，再向"反偏离方向"偏移，使方向盘把车转回中线
  const lookAhead = 4.5;
  const corr = Math.max(-3, Math.min(3, off * 1.2)); // 偏离越大修正越强，限幅
  return {
    x: seg.px + tnx * lookAhead - nx * corr,
    z: seg.pz + tnz * lookAhead - nz * corr,
  };
}
function routePathToIdx(targetIdx) {
  const startIdx = nearestRouteIdx();
  const n = routePoints.length;
  const forward = (targetIdx - startIdx + n) % n;
  const backward = (startIdx - targetIdx + n) % n;
  const step = forward <= backward ? 1 : -1;
  const count = Math.min(forward, backward);
  const path = [];
  for (let k = 1; k <= count; k += 1) {
    const p = routePoints[(startIdx + step * k + n) % n];
    path.push({ x: p.x, z: p.z });
  }
  return path;
}
function pathToBranchEnd(branch) {
  if (!branch) return [];
  const path = routePathToIdx(branch.ringIdx);
  for (const p of branch.points) path.push({ x: p.x, z: p.z });
  // 自动驾驶也停在房子外的路边下车点，与手动送达判定一致
  path.push({ x: branch.dropPt.x, z: branch.dropPt.z });
  return path.filter((p, i, arr) => i === 0 || Math.hypot(p.x - arr[i - 1].x, p.z - arr[i - 1].z) > 1.5);
}
function followAutoPath(path, idxName, dt, cruise = 6) {
  let idx = idxName === 'task' ? autoTaskIdx : autoBridgeIdx;
  const tgt = path[idx];
  if (!tgt) return true;
  const d = Math.hypot(tgt.x - taxi.pos.x, tgt.z - taxi.pos.z);
  // 接近路点即推进到下一个
  if (d < 3.2) idx += 1;
  else if (taxi.speed > 1.0) {
    // 仅在车实际行驶中检测"已越过当前路点"（走过头），避免掉头停车时误跳过路点
    const toTgt = { x: tgt.x - taxi.pos.x, z: tgt.z - taxi.pos.z };
    const fwd = { x: Math.sin(taxi.heading), z: Math.cos(taxi.heading) };
    if (toTgt.x * fwd.x + toTgt.z * fwd.z < -0.5 && idx < path.length - 1) idx += 1;
  }
  if (idxName === 'task') autoTaskIdx = idx;
  else autoBridgeIdx = idx;
  if (idx >= path.length) return true;
  // 拟人前瞻：看前方 1~2 个路点（看远开车），随车速加大前瞻距离
  const n1 = path[idx + 1] || path[idx];
  const n2 = path[idx + 2] || n1;
  const look = Math.min(0.6, 0.3 + taxi.speed * 0.04); // 车速越快越看远
  let aim = {
    x: path[idx].x * (1 - look) + n1.x * look * 0.6 + n2.x * look * 0.4,
    z: path[idx].z * (1 - look) + n1.z * look * 0.6 + n2.z * look * 0.4,
  };
  // 行驶中叠加"回中线"修正：用方向盘把车自然转回道路中央（不硬拉位置）
  if (taxi.speed > 1.0) {
    const c = aimPointForCenter();
    if (c) aim = { x: aim.x * 0.55 + c.x * 0.45, z: aim.z * 0.55 + c.z * 0.45 };
  }
  // 过桥时强制贴桥面中线 z=0：偏离桥面半宽则把瞄准点横向拉回，确保走在桥面再转弯
  if (idxName === 'bridge' && Math.abs(taxi.pos.z) > BRIDGE_Z_HALF * 0.6) {
    aim = { x: aim.x, z: aim.z * 0.2 };
  }
  steerAutoSafe(aim, dt, cruise);
  return false;
}
function startBridgeCrossing(resumeAfter = false) {
  const side = taxi.pos.x >= 0 ? 1 : -1;
  const entryIdx = side > 0 ? 0 : Math.floor(routePoints.length / 2);
  const path = routePathToIdx(entryIdx);
  autoBridgePath = [
    ...path,
    { x: side * ELLIPSE_A, z: 0 },
    { x: side * (LAKE_A + 8), z: 0 },
    { x: side * (LAKE_A + 1), z: 0 },
    { x: 0, z: 0 },
    { x: -side * (LAKE_A + 1), z: 0 },
    { x: -side * (LAKE_A + 8), z: 0 },
    { x: -side * ELLIPSE_A, z: 0 },
  ].filter((p, i, arr) => i === 0 || Math.hypot(p.x - arr[i - 1].x, p.z - arr[i - 1].z) > 2);
  autoBridgeIdx = 0;
  autoBridgeResume = resumeAfter;
  logEvent('自动驾驶过桥', resumeAfter ? '乘客送达后，经中央车行桥去对岸再继续接单' : '乘客全部送达，经中央车行桥去对岸');
  toast('自动驾驶', resumeAfter ? '送达完成，先过桥去对岸再继续接单' : '全部送达，开始过桥去对岸', 'good');
}

// 环线上两点间最短格数（前进/后退取小），用于最短路径接送。
function ringDist(aIdx, bIdx) {
  const n = routePoints.length;
  const fwd = (bIdx - aIdx + n) % n;
  const back = (aIdx - bIdx + n) % n;
  return Math.min(fwd, back);
}
// 找当前最近（环线最短路径）的候车乘客 —— 顺序不固定，每次接最近的一位。
function nearestWaitingNPC() {
  const startIdx = nearestRouteIdx();
  let best = null, bestCost = Infinity;
  for (const npc of npcs) {
    if (npc.state !== 'waiting') continue;
    const cost = ringDist(startIdx, npc.pickupIdx);
    if (cost < bestCost) { bestCost = cost; best = npc; }
  }
  return best;
}

// 自动驾驶：以最短路线接送乘客（顺序不固定，每次接最近候车者），沿道路行驶，送达后过桥去对岸。
function autoSteer(dt) {
  // 卡顿检测：长时间几乎没位移 → 重置路径并贴回最近路点，防止卡死
  const moved = Math.hypot(taxi.pos.x - autoLastPos.x, taxi.pos.z - autoLastPos.z);
  autoLastPos.copy(taxi.pos);
  if (moved < 0.02) autoStuckTimer += dt; else autoStuckTimer = 0;
  if (autoStuckTimer > 3) {
    autoStuckTimer = 0;
    autoTaskPath = []; autoTaskIdx = 0;
    const idx = nearestRouteIdx();
    const rp = routePoints[idx];
    taxi.pos.x = rp.x; taxi.pos.z = rp.z;
    const nxt = routePoints[(idx + 1) % routePoints.length];
    taxi.heading = Math.atan2(nxt.x - rp.x, nxt.z - rp.z);
    taxi.speed = 0;
  }

  // 过桥优先
  if (autoBridgePath.length) {
    if (followAutoPath(autoBridgePath, 'bridge', dt, 6)) {
      autoBridgePath = []; autoBridgeIdx = 0;
      autoTargetIdx = nearestRouteIdx();
      if (autoBridgeResume) {
        autoBridgeResume = false;
        toast('自动驾驶', '已到对岸，继续沿环线接单', 'good');
      } else {
        autoDrive = false;
        taxi.speed = 0;
        toast('自动驾驶', '已通过桥到达对岸', 'good');
      }
    }
    return;
  }

  // 有乘客在车上 → 走最短路径送到其路边下车点（环线前进/后退取短 + 分支路）
  const rider = npcs.find(n => n.state === 'riding');
  if (rider && rider.branch) {
    if (!autoTaskPath.length) { autoTaskPath = pathToBranchEnd(rider.branch); autoTaskIdx = 0; }
    if (followAutoPath(autoTaskPath, 'task', dt, 6)) { autoTaskPath = []; autoTaskIdx = 0; }
    return;
  } else if (autoTaskPath.length) { autoTaskPath = []; autoTaskIdx = 0; }

  // 无乘客 → 去最近的候车乘客（环线最短路径，顺序不固定）
  const target = nearestWaitingNPC();
  if (target) {
    if (!autoTaskPath.length) { autoTaskPath = routePathToIdx(target.pickupIdx); autoTaskIdx = 0; }
    if (followAutoPath(autoTaskPath, 'task', dt, 6)) { autoTaskPath = []; autoTaskIdx = 0; }
    return;
  }

  // 全部送达 → 过桥去对岸
  if (npcs.length && npcs.every(n => n.state === 'done')) { startBridgeCrossing(false); return; }

  // 无任务时沿环线低速巡航，保持在路上；叠加回中线修正
  const bestIdx = nearestRouteIdx();
  const bestD = Math.hypot(routePoints[bestIdx].x - taxi.pos.x, routePoints[bestIdx].z - taxi.pos.z);
  autoTargetIdx = bestD < 4 ? (bestIdx + 1) % routePoints.length : bestIdx;
  let aim = routePoints[autoTargetIdx];
  if (taxi.speed > 1.0) { const c = aimPointForCenter(); if (c) aim = { x: aim.x * 0.5 + c.x * 0.5, z: aim.z * 0.5 + c.z * 0.5 }; }
  steerAutoSafe(aim, dt, 5);
}

// ──────────────────────────────────────────────
// NPC passengers (3) — free pickup, can reverse
// ──────────────────────────────────────────────

function buildPerson(shirt) {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: C.skin });
  const shirtM = new THREE.MeshLambertMaterial({ color: shirt });
  const shirtDark = new THREE.MeshLambertMaterial({ color: new THREE.Color(shirt).multiplyScalar(0.78) });
  const shirtLight = new THREE.MeshLambertMaterial({ color: new THREE.Color(shirt).multiplyScalar(1.18) });
  const hairM = new THREE.MeshLambertMaterial({ color: C.hair });
  const pantsM = new THREE.MeshLambertMaterial({ color: 0x34506b });
  const bagM = new THREE.MeshLambertMaterial({ color: 0x6b4a2e });
  const shoeM = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const eyeM = new THREE.MeshLambertMaterial({ color: 0x222222 });
  // 腿（保持前两个 children 为腿，供下车动画摆动）
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.22), pantsM);
  const leg2 = leg.clone(); leg.position.x = -0.13; leg2.position.x = 0.13; leg.position.y = leg2.position.y = 0.25;
  // 鞋
  const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.3), shoeM); shoe.position.set(-0.13, 0.06, 0.05);
  const shoe2 = shoe.clone(); shoe2.position.x = 0.13;
  // 躯干 + 衣领/亮面色块
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.3), shirtM); body.position.y = 0.78;
  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.04), shirtLight); collar.position.set(0, 1.02, 0.17);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.06, 0.32), shirtDark); belt.position.y = 0.52;
  // 手臂 + 手掌
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.42, 0.18), shirtM); arm.position.set(-0.32, 0.84, 0);
  const arm2 = arm.clone(); arm2.position.x = 0.32;
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.16), skin); hand.position.set(-0.32, 0.56, 0.02);
  const hand2 = hand.clone(); hand2.position.x = 0.32;
  // 背包和斜挎带：让乘客/路人更有生活感
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.38, 0.12), bagM); bag.position.set(0, 0.78, -0.23);
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.68, 0.04), bagM); strap.position.set(-0.12, 0.84, 0.18); strap.rotation.z = -0.38;
  // 脖子 / 头 / 发型
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.16), skin); neck.position.y = 1.08;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skin); head.position.y = 1.3;
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.16, 0.44), hairM); hair.position.y = 1.5;
  const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.08), hairM); fringe.position.set(0, 1.42, 0.22);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), shirtDark); cap.position.y = 1.6;
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.04, 0.16), shirtDark); brim.position.set(0, 1.58, 0.3);
  // 眼睛 + 小鼻子
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), eyeM); eye.position.set(-0.1, 1.32, 0.21);
  const eye2 = eye.clone(); eye2.position.x = 0.1;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.04), skin); nose.position.set(0, 1.25, 0.23);
  g.add(leg, leg2, shoe, shoe2, body, collar, belt, arm, arm2, hand, hand2, bag, strap, neck, head, hair, fringe, cap, brim, eye, eye2, nose);
  return g;
}
function buildMarker(color) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.4, 0.08), new THREE.MeshLambertMaterial({ color }));
  const ball = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6 }));
  ball.position.y = 1.0; g.add(pole, ball); g.position.y = 2.0;
  return g;
}

// 固定分布的动物模型（6 种）：大象/兔子/鹿/猪/牛/羊
function buildAnimalModel(kind) {
  const g = new THREE.Group();
  const palette = {
    elephant: 0x9aa0a8, rabbit: 0xd8d4cc, deer: 0x9b6b3a,
    pig: 0xe89aa8, cow: 0xefe8dc, sheep: 0xf0ede4, horse: 0x9a6336, cat: 0x6a6a6a, dog: 0xc8a878,
  };
  const col = palette[kind] || 0x888888;
  const mat = new THREE.MeshLambertMaterial({ color: col });
  const dark = new THREE.MeshLambertMaterial({ color: 0x444444 });
  const cfg = {
    elephant: { body: [1.0, 0.8, 1.4], head: [0.5, 0.5, 0.5], legH: 0.6, by: 0.7, hy: 1.0, hz: 0.9, trunk: true, ear: true },
    rabbit:   { body: [0.4, 0.4, 0.6], head: [0.3, 0.3, 0.3], legH: 0.2, by: 0.35, hy: 0.6, hz: 0.4, ear: true },
    deer:     { body: [0.5, 0.5, 1.0], head: [0.35, 0.35, 0.35], legH: 0.5, by: 0.55, hy: 0.8, hz: 0.6, antler: true },
    pig:      { body: [0.6, 0.5, 0.9], head: [0.4, 0.4, 0.4], legH: 0.25, by: 0.4, hy: 0.55, hz: 0.55, snout: true },
    cow:      { body: [0.8, 0.6, 1.2], head: [0.45, 0.45, 0.45], legH: 0.45, by: 0.55, hy: 0.8, hz: 0.75, horn: true, patch: true },
    sheep:    { body: [0.7, 0.6, 1.0], head: [0.35, 0.35, 0.35], legH: 0.3, by: 0.5, hy: 0.75, hz: 0.6 },
    horse:    { body: [0.75, 0.65, 1.45], head: [0.36, 0.45, 0.42], legH: 0.55, by: 0.65, hy: 1.0, hz: 0.85, mane: true },
    cat:      { body: [0.36, 0.28, 0.62], head: [0.28, 0.26, 0.26], legH: 0.18, by: 0.28, hy: 0.52, hz: 0.38, ear: true },
    dog:      { body: [0.42, 0.34, 0.72], head: [0.3, 0.3, 0.3], legH: 0.22, by: 0.34, hy: 0.58, hz: 0.45, ear: true, snout: true },
  }[kind] || { body: [0.5, 0.5, 0.8], head: [0.35, 0.35, 0.35], legH: 0.4, by: 0.5, hy: 0.8, hz: 0.5 };
  const body = new THREE.Mesh(new THREE.BoxGeometry(...cfg.body), mat);
  body.position.y = cfg.by; g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(...cfg.head), mat);
  head.position.set(0, cfg.hy, cfg.hz); g.add(head);
  // 四条腿
  const lx = cfg.body[0] / 2 - 0.1, lz1 = cfg.body[2] / 2 - 0.1, lz2 = -cfg.body[2] / 2 + 0.1;
  for (const [sx, sz] of [[-lx, lz1], [lx, lz1], [-lx, lz2], [lx, lz2]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, cfg.legH, 0.14), dark);
    leg.position.set(sx, cfg.legH / 2, sz); g.add(leg);
    const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.18), dark);
    hoof.position.set(sx, 0.04, sz + 0.02); g.add(hoof);
  }
  // 五官、尾巴和体表纹理，用少量方块提高辨识度。
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.025), dark);
    eye.position.set(sx * 0.1, cfg.hy + 0.05, cfg.hz + cfg.head[2] / 2 + 0.02); g.add(eye);
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.34), dark);
  tail.position.set(0, cfg.by + 0.12, -cfg.body[2] / 2 - 0.16); tail.rotation.x = -0.35; g.add(tail);
  if (cfg.patch) {
    for (const [px, py, pz] of [[-0.22, 0.08, 0.15], [0.24, 0.02, -0.18], [0.02, 0.16, 0.32]]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 0.22), dark);
      p.position.set(px, cfg.by + py, pz); g.add(p);
    }
  }
  if (kind === 'sheep') {
    for (const [px, pz] of [[-0.22, 0.25], [0.2, 0.1], [0, -0.22]]) {
      const wool = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.24), mat);
      wool.position.set(px, cfg.by + 0.34, pz); g.add(wool);
    }
  }
  if (kind === 'rabbit') {
    for (const sx of [-1, 1]) {
      const longEar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.1), mat);
      longEar.position.set(sx * 0.09, cfg.hy + 0.36, cfg.hz); g.add(longEar);
    }
  }
  if (cfg.mane) {
    const mane = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.12), dark);
    mane.position.set(0, cfg.hy + 0.05, cfg.hz - 0.18); g.add(mane);
  }
  if (cfg.trunk) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.5), mat); t.position.set(0, cfg.hy - 0.1, cfg.hz + 0.4); g.add(t); }
  if (cfg.ear) { for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.26, 0.14), mat); e.position.set(s * (cfg.head[0] / 2 + 0.04), cfg.hy + 0.12, cfg.hz); g.add(e); } }
  if (cfg.antler) { for (const s of [-1, 1]) { const a = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 0.06), dark); a.position.set(s * 0.12, cfg.hy + 0.27, cfg.hz); g.add(a); const branch = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.06), dark); branch.position.set(s * 0.18, cfg.hy + 0.38, cfg.hz + 0.06); branch.rotation.z = s * 0.55; g.add(branch); } }
  if (cfg.snout) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.15, 0.16), new THREE.MeshLambertMaterial({ color: 0xf0b0bc })); s.position.set(0, cfg.hy - 0.05, cfg.hz + cfg.head[2] / 2); g.add(s); }
  if (cfg.horn) { for (const s of [-1, 1]) { const h = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.06), dark); h.position.set(s * 0.16, cfg.hy + 0.22, cfg.hz + 0.02); h.rotation.z = s * 0.3; g.add(h); } }
  return g;
}

class NPC {
  constructor(id, shirt, pickupPt, homePt, branch = null) {
    this.id = id; this.shirt = shirt; this.branch = branch;
    this.pickup = pickupPt; this.home = homePt;
    // 实际下车点：房子外的路边，送到这里即可，不必开到房子门口
    this.dropoff = (branch && branch.dropPt) ? branch.dropPt : homePt;
    this.mesh = buildPerson(shirt); this.marker = buildMarker(shirt);
    this.mesh.add(this.marker); scene.add(this.mesh);
    this.state = 'waiting'; this.waitTime = 0; this.warned = false;
    this.deadline = 0; this.timed = false; this.complained = false;
    this.showAt(this.pickup);
  }
  showAt(pt) {
    const y = heightAt(pt.x, pt.z);
    this.mesh.position.set(pt.x + 0.5, y + 0.5, pt.z + 0.5);
    this.mesh.visible = true; this.marker.visible = true;
  }
  tryPickup() {
    if (this.state !== 'waiting') return false;
    const d = Math.hypot(this.pickup.x + 0.5 - taxi.pos.x, this.pickup.z + 0.5 - taxi.pos.z);
    if (d < 3.2) {
      this.state = 'riding';
      this.mesh.visible = false; this.marker.visible = false;
      destBeacon.show(this.dropoff);
      // 限时模式：按接单顺序固定时限（第1位25s、第2位20s、第3位15s）
      if (gameMode === 'timed') {
        // 限时模式：按送达顺序给时限（不固定乘客顺序）—— 第1单60s、第2单45s、第3单30s
        const limits = [60, 45, 30];
        this.deadline = limits[Math.min(gov.completed, 2)];
        this.timed = true; this.complained = false;
        toast('限时送达', `${this.id} 要求 ${this.deadline}s 内送达`, 'warn');
      }
      logEvent('接单上车', `${this.id} 在 ${this.pickup.label} 上车 → ${this.home.label}`);
      showPassengerDialog(this);
      toast('接单成功', `${this.id} 已上车`, 'good');
      return true;
    }
    return false;
  }
  tryDropoff() {
    if (this.state !== 'riding') return false;
    // 送到房子外的路边下车点即可（半径放宽到 5，更易送达）
    const d = Math.hypot(this.dropoff.x + 0.5 - taxi.pos.x, this.dropoff.z + 0.5 - taxi.pos.z);
    if (d < 5) {
      const base = 20 + Math.round(Math.hypot(this.home.x - this.pickup.x, this.home.z - this.pickup.z) * 1.6);
      let fare = base, cls = 'good', note = '';
      if (this.timed && !this.complained) {
        gov.satisfied += 1; fare += 10; note = ' · 按时送达 +10';
      }
      gov.coins += fare; gov.completed += 1;
      logEvent('送达完成', `${this.id} 已送达 · +${fare} 金币${note}`, cls);
      toast('送达完成', `+${fare} 金币${note}`, 'good');
      destBeacon.hide(); autoTaskPath = []; autoTaskIdx = 0;
      this.state = 'done'; this.mesh.visible = false;
      disembarkAnim(this); // 乘客下车画面
      const allDone = npcs.every(n => n.state === 'done');
      if (allDone) toast('环线完成', '3 位乘客全部送达，自动驾驶将经桥去对岸', 'good');
      if (autoDrive) startBridgeCrossing(!allDone);
      return true;
    }
    return false;
  }
  tick(dt) {
    if (this.state === 'waiting') {
      this.waitTime += dt;
      if (!this.warned && this.waitTime > 30) {
        this.warned = true; gov.pressCount += 1;
        logEvent('压单预警', `${this.id} 在 ${this.pickup.label} 久等未派单`, 'warn');
      }
    } else if (this.state === 'riding' && this.timed && !this.complained) {
      this.deadline -= dt;
      if (this.deadline <= 0) {
        this.complained = true; gov.complaints += 1;
        logEvent('乘客抱怨', `${this.id} 超时未送达，乘客抱怨`, 'bad');
        toast('乘客抱怨', `${this.id} 等太久，满意度下降`, 'bad');
      }
    }
  }
}

const npcs = [];
let ridingNPC = null;
let passengerDialogTimer = null;


function passengerExpectation(npc) {
  const label = npc.home.label || '';
  if (label.includes('沙滩')) return '我想去夏日沙滩别墅，能看看海边和椰子树就太好了。';
  if (label.includes('农场')) return '我要回农场木屋，路上请开稳一点，别吓到牛羊和马。';
  if (label.includes('小镇')) return '我要去乡村小镇中间的家，希望路上能看到果树、小猫小狗和热闹街道。';
  return '期待一段舒服的行程。';
}
function showPassengerDialog(npc) {
  const el = document.getElementById('passengerDialog');
  if (!el) return;
  el.innerHTML = `<b>${npc.id} 上车 · 目的地：${npc.home.label}</b>${passengerExpectation(npc)}`;
  el.classList.add('show');
  clearTimeout(passengerDialogTimer);
  passengerDialogTimer = setTimeout(() => el.classList.remove('show'), 3000);
}
function hidePassengerDialog() {
  clearTimeout(passengerDialogTimer);
  passengerDialogTimer = null;
  document.getElementById('passengerDialog')?.classList.remove('show');
}

// 乘客下车动画：在车旁生成临时 NPC，走向家方向几步后消失
const disembarking = [];
function disembarkAnim(npc) {
  const m = buildPerson(npc.shirt);
  m.position.set(taxi.pos.x + 1.2, heightAt(taxi.pos.x + 1.2, taxi.pos.z) + 0.5, taxi.pos.z);
  scene.add(m);
  const dir = new THREE.Vector3(npc.home.x - taxi.pos.x, 0, npc.home.z - taxi.pos.z).normalize();
  disembarking.push({ mesh: m, dir, life: 2.5, phase: 0 });
}

function updateDisembarking(dt) {
  for (let i = disembarking.length - 1; i >= 0; i -= 1) {
    const d = disembarking[i];
    d.life -= dt;
    // 先下车（车旁站立 0.4s），再走向家方向
    if (d.life < 2.1) {
      d.mesh.position.x += d.dir.x * 1.5 * dt;
      d.mesh.position.z += d.dir.z * 1.5 * dt;
      d.mesh.position.y = heightAt(d.mesh.position.x, d.mesh.position.z) + 0.5;
      d.mesh.rotation.y = Math.atan2(d.dir.x, d.dir.z);
      // 腿部摆动
      const swing = Math.sin(performance.now() * 0.02) * 0.4;
      if (d.mesh.children[0]) d.mesh.children[0].rotation.x = swing;
      if (d.mesh.children[1]) d.mesh.children[1].rotation.x = -swing;
    }
    if (d.life <= 0) { scene.remove(d.mesh); disembarking.splice(i, 1); }
  }
}
function spawnNPCs() {
  // 取出候车点在环线上的索引（用于最短路径规划，顺序不固定）
  const pickupIdxs = [];
  routePoints.forEach((p, i) => { if (p.kind === 'pickup') pickupIdxs.push(i); });
  const pickups = pickupIdxs.map(i => routePoints[i]);
  const ids = ['1', '2', '3'], shirts = [C.shirtA, C.shirtB, C.shirtC];
  for (let i = 0; i < 3; i += 1) {
    const br = branchRoutes[i];
    const npc = new NPC(`乘客${ids[i]}`, shirts[i], pickups[i], br.end, br);
    npc.pickupIdx = pickupIdxs[i];
    npcs.push(npc);
  }
}

// 固定分布动物（6 种）+ 路人 NPC（3 名），分布在桥头路肩与环形路上
const roadAnimals = [];   // 固定动物
const pedestrians = [];   // 路人 NPC
const wanderers = [];     // 主题区动物/路人：在 home 一定半径内自由漫游
let blockCount = 0;       // 本局已挡路次数（最多 2 次）

// 通用漫游：在 home 半径范围内随机选点走过去，到达后再选下一个，朝向随移动方向。
function pickRoamTarget(w) {
  const ang = Math.random() * Math.PI * 2;
  const r = Math.random() * w.radius;
  w.target = { x: w.home.x + Math.cos(ang) * r, z: w.home.z + Math.sin(ang) * r };
  w.t = 2.5 + Math.random() * 4;
}
function roamStep(w, dt) {
  w.t -= dt;
  if (w.t <= 0) pickRoamTarget(w);
  const dx = w.target.x - w.mesh.position.x;
  const dz = w.target.z - w.mesh.position.z;
  const d = Math.hypot(dx, dz);
  if (d > 0.18) {
    const step = Math.min(d, w.speed * dt);
    w.mesh.position.x += (dx / d) * step;
    w.mesh.position.z += (dz / d) * step;
    w.mesh.rotation.y = Math.atan2(dx, dz);
    if (w.legs) {
      const sw = Math.sin(performance.now() * 0.02) * 0.35;
      for (let i = 0; i < w.legs.length; i += 1) w.legs[i].rotation.x = (i % 2 ? sw : -sw);
    }
  }
  w.mesh.position.y = heightAt(w.mesh.position.x, w.mesh.position.z) + w.yOff;
}

function placeRoadAnimals() {
  const kinds = ['elephant', 'rabbit', 'deer', 'pig', 'cow', 'sheep'];
  // 6 只动物分布在桥头草地/环形路各段，桥面中心保持清空让出租车通行。
  const spots = [
    { x: -LAKE_A - 5, z: BRIDGE_Z_HALF + 4 }, // 西桥头路肩
    { x: LAKE_A + 5, z: -BRIDGE_Z_HALF - 4 }, // 东桥头路肩
    { x: routePoints[8].x, z: routePoints[8].z + 3 },   // A 候车点旁路面
    { x: routePoints[20].x - 3, z: routePoints[20].z }, // B 候车点旁
    { x: routePoints[32].x, z: routePoints[32].z - 3 }, // C 候车点旁
    { x: routePoints[0].x - 6, z: routePoints[0].z },   // 场站旁
  ];
  for (let i = 0; i < 6; i += 1) {
    const s = spots[i];
    const mesh = buildAnimalModel(kinds[i]);
    const gy = heightAt(s.x, s.z);
    mesh.position.set(s.x, gy + 0.5, s.z);
    mesh.rotation.y = Math.random() * 6;
    scene.add(mesh);
    roadAnimals.push({
      mesh, kind: kinds[i], home: { x: s.x, z: s.z },
      state: 'roam', timer: 0, blockTimer: 0,
      radius: 9, speed: 1.0, yOff: 0.5, target: { x: s.x, z: s.z }, t: Math.random() * 3,
      legs: null, blockChance: 8 + Math.random() * 10,
    });
  }
}

function placePedestrians() {
  // 3 名路人 NPC 分布在环形路上不同路点，各自在附近半径内自由漫步
  const idxs = [4, 16, 36];
  const shirts = [0x9b6bd6, 0x6bb8d6, 0xd6a06b];
  for (let i = 0; i < 3; i += 1) {
    const p = routePoints[idxs[i]];
    const mesh = buildPerson(shirts[i]);
    const gy = heightAt(p.x, p.z);
    const home = { x: p.x, z: p.z + 2 };
    mesh.position.set(home.x, gy + 0.5, home.z);
    mesh.rotation.y = Math.random() * 6;
    scene.add(mesh);
    pedestrians.push({ mesh, home, radius: 7, speed: 1.6, yOff: 0.5, target: { ...home }, t: Math.random() * 3, legs: [mesh.children[0], mesh.children[1]] });
  }
}

function updateRoadAnimals(dt) {
  for (const a of roadAnimals) {
    if (a.state === 'blocking') {
      a.blockTimer -= dt;
      if (a.blockTimer <= 0) {
        a.state = 'roam'; a.t = 0; a.blockChance = 12 + Math.random() * 10;
        toast('道路恢复', `${a.kind} 已离开，出租车可通行`, 'good');
      }
      continue;
    }
    // 自由漫游：在 home 半径内随机走动
    roamStep(a, dt);
    // 偶发挡路（本局未满 2 次、玩家在驾驶、且动物家在可行驶路段旁）
    a.blockChance -= dt;
    if (a.blockChance <= 0) {
      if (blockCount < 2 && mode === 'drive' && nearDriveRoute(a.home.x, a.home.z)) {
        const gx = Math.round(a.home.x), gz = Math.round(a.home.z);
        a.mesh.position.set(gx, heightAt(gx, gz) + 0.5, gz);
        a.state = 'blocking'; a.blockTimer = 3; blockCount += 1;
        toast('动物挡路', `${a.kind} 挡在路上，3秒后离开`, 'warn');
        logEvent('动物挡路', `${a.kind} 挡住道路 · 已发生 ${blockCount}/2 次`, 'warn');
      } else {
        a.blockChance = 10 + Math.random() * 10;
      }
    }
  }
}

function updatePedestrians(dt) {
  for (const p of pedestrians) roamStep(p, dt);
}
function updateWanderers(dt) {
  for (const w of wanderers) roamStep(w, dt);
}

// 检查出租车是否被挡路动物挡住（前方有 blocking 动物则不可通行）
function animalBlocking(x, z) {
  for (const a of roadAnimals) {
    if (a.state !== 'blocking') continue;
    if (Math.hypot(a.mesh.position.x - x, a.mesh.position.z - z) < 1.8) return true;
  }
  return false;
}

const destBeacon = {
  group: new THREE.Group(),
  show(pt) {
    this.group.clear();
    const mat = new THREE.MeshStandardMaterial({ color: 0x4caf6a, emissive: 0x4caf6a, emissiveIntensity: 0.7, transparent: true, opacity: 0.85 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 4, 8), mat); pole.position.y = 2;
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat); top.position.y = 4.2;
    this.group.add(pole, top); this.group.visible = true;
    this.group.position.set(pt.x + 0.5, heightAt(pt.x, pt.z) + 0.5, pt.z + 0.5);
    this.pt = pt;
  },
  hide() { this.group.visible = false; this.pt = null; },
};
destBeacon.hide(); scene.add(destBeacon.group);

function rideLogic(dt) {
  for (const n of npcs) n.tick(dt);
  if (!ridingNPC) {
    for (const n of npcs) { if (n.state === 'waiting' && n.tryPickup()) { ridingNPC = n; break; } }
  } else {
    ridingNPC.tryDropoff();
    if (ridingNPC.state !== 'riding') ridingNPC = null;
  }
  if (destBeacon.group.visible) {
    destBeacon.group.children[1].rotation.y += dt * 2;
    destBeacon.group.children[1].position.y = 4.2 + Math.sin(performance.now() * 0.003) * 0.25;
  }
  // 限时模式倒计时 HUD
  const rider = npcs.find(n => n.state === 'riding');
  countdownEl(rider);
}

// ──────────────────────────────────────────────
// Governance
// ──────────────────────────────────────────────

const gov = { coins: 0, completed: 0, pressCount: 0, broken: 0, placed: 0, appeals: 0, satisfied: 0, complaints: 0, chainTampered: false, chainVerified: false };
const events = [];
let evtCounter = 0;
function logEvent(type, summary, cls = '') {
  evtCounter += 1;
  events.unshift({ id: `E-${String(evtCounter).padStart(3, '0')}`, type, summary, cls });
  if (events.length > 30) events.pop();
  gov.chainVerified = false; renderLog(); renderChain();
}
function renderLog() {
  document.getElementById('log').innerHTML = events.slice(0, 6).map(e => `<div class="${e.cls}"><b>${e.type}</b> · ${e.summary}</div>`).join('');
}
function simpleHash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `h${(h >>> 0).toString(16).padStart(8, '0')}`;
}
function buildChain() {
  let prev = 'GENESIS';
  return [...events].reverse().map((e) => {
    const payload = `${prev}|${e.id}|${e.type}|${e.summary}`;
    const hash = simpleHash(payload);
    const item = { ...e, prevHash: prev, hash }; prev = hash; return item;
  }).reverse();
}
function verifyChain() {
  const chain = buildChain();
  gov.chainVerified = !gov.chainTampered && chain.every((it, i) => { const next = chain[i + 1]; return !next || next.hash === it.prevHash; });
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
      <b>${it.type}</b><span>${gov.chainTampered && i === 0 ? 'prev: BROKEN' : `${it.hash}`}</span>
    </div>`).join('');
}
function fairnessIndex() { return Math.max(40, Math.min(99, 92 - gov.complaints * 4 - gov.pressCount * 2)); }
function satisfaction() {
  const denom = gov.satisfied + gov.complaints;
  return denom === 0 ? 100 : Math.round((gov.satisfied / denom) * 100);
}

// ──────────────────────────────────────────────
// HUD
// ──────────────────────────────────────────────

const statsEl = document.getElementById('stats');
const debugHud = document.getElementById('debugHud');
const zoneEl = document.getElementById('zoneHud');
const countdownEl = (() => { const e = document.getElementById('countdown'); return (rider) => {
  if (!e) return;
  if (gameMode === 'timed' && rider && rider.timed && !rider.complained && rider.deadline > 0) {
    e.style.display = 'block';
    e.classList.toggle('urgent', rider.deadline < 10);
    e.textContent = `⏱ ${rider.id} 送达倒计时 ${Math.ceil(rider.deadline)}s`;
  } else e.style.display = 'none';
}; })();

let hudTimer = 0, curZone = 'city';
function renderHUD(dt) {
  hudTimer += dt;
  if (hudTimer < 0.1) return;
  hudTimer = 0;
  const waiting = npcs.filter(n => n.state === 'waiting').length;
  const riding = npcs.find(n => n.state === 'riding');
  let task = '自由探索';
  if (riding) task = `送 ${riding.id} 回家`;
  else if (waiting) task = `去候车点接客（剩 ${waiting}）`;
  else if (npcs.every(n => n.state === 'done')) task = '环线完成，返回场站';
  statsEl.innerHTML = `
    <div class="stat good"><span>金币</span><b>${gov.coins}</b></div>
    <div class="stat"><span>已完成</span><b>${gov.completed}/3</b></div>
    <div class="stat warn"><span>压单率</span><b>${pressRate()}%</b></div>
    <div class="stat"><span>公平指数</span><b>${fairnessIndex()}</b></div>
    <div class="stat good"><span>满意度</span><b>${satisfaction()}%</b></div>
    <div class="stat bad"><span>抱怨</span><b>${gov.complaints}</b></div>
  `;
  if (zoneEl) zoneEl.innerHTML = `<b>${ZONE_NAMES[curZone]}</b> · ${task} · ${gameMode === 'timed' ? '限时模式' : '自由模式'}${timeOfDay === 'night' ? ' · 夜' : ''}`;
  const k = (c) => `<span class="k ${keys[c] ? 'on' : ''}">${keys[c] ? '●' : '·'}</span>`;
  if (debugHud) debugHud.innerHTML = `
    模式 <b>${mode === 'foot' ? '步行' : '驾驶'}</b> · 锁定 <b>${locked ? '是' : '否'}</b><br>
    坐标 <b>${player.pos.x.toFixed(1)}, ${player.pos.y.toFixed(1)}, ${player.pos.z.toFixed(1)}</b><br>
    着地 <b>${player.onGround ? '是' : '否'}</b> · 水中 <b>${footInWater() ? '是' : '否'}</b><br>
    按键 W${k('KeyW')} A${k('KeyA')} S${k('KeyS')} D${k('KeyD')} 空${k('Space')}
  `;
  drawMinimap();
}

// 司机小地图：俯视示意图
const minimapCanvas = document.getElementById('minimap');
const minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;
function mmSize() { return minimapCanvas?.width || 200; }
function mmX(wx) { return ((wx + HALF) / SIZE) * mmSize(); }
function mmY(wz) { return ((wz + HALF) / SIZE) * mmSize(); }
// 小地图目的地图标：海边/小镇/农村三种语义符号
function drawDestIcon(ctx, x, y, type, color) {
  // 白底圆角徽章
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = color || '#444';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  ctx.clip();
  if (type === 'beach') {
    // 海边：太阳 + 海浪
    ctx.fillStyle = '#ffb43f';
    ctx.beginPath(); ctx.arc(x, y - 1.5, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2f7fd0'; ctx.lineWidth = 1.4;
    for (let i = 0; i < 2; i += 1) {
      ctx.beginPath();
      ctx.moveTo(x - 6, y + 3 + i * 2.4);
      ctx.quadraticCurveTo(x - 2, y + 1 + i * 2.4, x + 1, y + 3 + i * 2.4);
      ctx.quadraticCurveTo(x + 4, y + 5 + i * 2.4, x + 6, y + 3 + i * 2.4);
      ctx.stroke();
    }
  } else if (type === 'farm') {
    // 农村：谷仓 + 麦穗
    ctx.fillStyle = '#b8562e';
    ctx.fillRect(x - 3.4, y - 1, 6.8, 5.2);
    ctx.fillStyle = '#7a3a1a';
    ctx.beginPath(); ctx.moveTo(x - 4.2, y - 1); ctx.lineTo(x, y - 5); ctx.lineTo(x + 4.2, y - 1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f4d23f';
    ctx.fillRect(x - 0.7, y + 0.6, 1.4, 3.4);
  } else if (type === 'town') {
    // 小镇：两栋房屋
    ctx.fillStyle = '#d8d2c4';
    ctx.fillRect(x - 5.5, y - 1, 4.4, 5.2);
    ctx.fillRect(x + 1.1, y - 2.4, 4.4, 6.6);
    ctx.fillStyle = '#8a4a3a';
    ctx.beginPath(); ctx.moveTo(x - 6, y - 1); ctx.lineTo(x - 3.3, y - 4); ctx.lineTo(x - 0.6, y - 1); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + 0.6, y - 2.4); ctx.lineTo(x + 3.3, y - 5.4); ctx.lineTo(x + 6, y - 2.4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5a8fd0';
    ctx.fillRect(x - 4.4, y + 0.6, 1.2, 1.2); ctx.fillRect(x + 2.2, y - 0.6, 1.2, 1.2);
  }
  ctx.restore();
}

function drawMinimap() {
  if (!minimapCtx) return;
  const ctx = minimapCtx;
  // 背景
  const ms = mmSize();
  ctx.fillStyle = '#cfe6b8'; ctx.fillRect(0, 0, ms, ms);
  // 中央不规则椭圆湖（近似画椭圆）
  ctx.fillStyle = '#7fb8e8';
  ctx.beginPath();
  ctx.ellipse(mmX(0), mmY(0), (LAKE_A / SIZE) * ms, (LAKE_B / SIZE) * ms, 0, 0, 7);
  ctx.fill();
  // 环线路径
  ctx.strokeStyle = '#5a5a62'; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath();
  routePoints.forEach((p, i) => { const x = mmX(p.x), y = mmY(p.z); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
  ctx.lineTo(mmX(routePoints[0].x), mmY(routePoints[0].z));
  ctx.stroke();
  // 三条向外分支路线 + 主题终点
  const rider = npcs.find(n => n.state === 'riding');
  const activeEnd = rider ? rider.home : null;
  for (const br of branchRoutes) {
    const isActive = activeEnd && activeEnd.x === br.end.x && activeEnd.z === br.end.z;
    ctx.strokeStyle = br.color || '#7a7a82'; ctx.lineWidth = isActive ? 4 : 3;
    ctx.beginPath();
    br.points.forEach((p, i) => { const x = mmX(p.x), y = mmY(p.z); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.stroke();
    const ex = mmX(br.end.x), ey = mmY(br.end.z);
    // 当前目的地：脉冲高亮环
    if (isActive) {
      const pulse = 9 + Math.sin(performance.now() * 0.006) * 2.5;
      ctx.strokeStyle = br.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ex, ey, pulse, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = br.color || '#7a5cff'; ctx.beginPath(); ctx.arc(ex, ey, 5, 0, 7); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
    // 目的地语义图标（海边/小镇/农村）
    drawDestIcon(ctx, ex, ey, br.id, br.color);
    // 图标下方文字标签
    ctx.fillStyle = '#1a1a22'; ctx.font = 'bold 9px Inter, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(br.tag || '', ex, ey + 18);
  }
  // 场站
  const s = routePoints[0];
  ctx.fillStyle = '#4caf6a'; ctx.beginPath(); ctx.arc(mmX(s.x), mmY(s.z), 4, 0, 7); ctx.fill();
  // 候车乘客（红）/ 家（灰）/ 目的地（绿，正在送的）
  for (const n of npcs) {
    if (n.state === 'waiting') {
      ctx.fillStyle = '#ef6f6f'; ctx.beginPath(); ctx.arc(mmX(n.pickup.x), mmY(n.pickup.z), 4, 0, 7); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
    } else if (n.state === 'riding') {
      // 正在送达的目的地 = 房子外路边下车点
      ctx.fillStyle = '#4caf6a'; ctx.beginPath(); ctx.arc(mmX(n.dropoff.x), mmY(n.dropoff.z), 5, 0, 7); ctx.fill();
    }
  }
  // 出租车（黄，带朝向三角）
  const tx = mmX(taxi.pos.x), ty = mmY(taxi.pos.z);
  ctx.save(); ctx.translate(tx, ty); ctx.rotate(-taxi.heading);
  ctx.fillStyle = '#ffd23f'; ctx.beginPath();
  ctx.moveTo(0, -5); ctx.lineTo(3.5, 4); ctx.lineTo(-3.5, 4); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#5a4a00'; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
}
function pressRate() {
  const denom = gov.completed + gov.pressCount + gov.complaints + 1;
  return Math.round((gov.pressCount / denom) * 100);
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
  setTimeout(() => { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 3200);
}

// ──────────────────────────────────────────────
// Day / night
// ──────────────────────────────────────────────

let timeOfDay = 'day';
function toggleDayNight() {
  timeOfDay = timeOfDay === 'day' ? 'night' : 'day';
  scene.background = makeSkyTexture(timeOfDay);
  applyZoneLighting(curZone);
  toast('昼夜切换', timeOfDay === 'night' ? '夜晚' : '白天', '');
}
function applyZoneLighting(zone) {
  const st = ZONE_STYLE[zone];
  // 按段调整雾化距离：山林近而浓（远景8格淡化），滨湖远而通透
  scene.fog.near = st.fogNear; scene.fog.far = st.fogFar;
  if (timeOfDay === 'night') {
    sun.color.setHex(st.sunNight); sun.intensity = 0.35;
    amb.intensity = 0.18;
    hemi.intensity = 0.4;
    scene.fog.color.setHex(st.fogNight);
  } else {
    sun.color.setHex(st.sunDay); sun.intensity = 0.85;
    amb.intensity = 0.35;
    hemi.intensity = 0.95;
    scene.fog.color.setHex(st.fogDay);
  }
  // 灯/招牌 emissive 强度
  for (const d of dynMeshes) {
    if (d.emissiveMat) d.emissiveMat.emissiveIntensity = timeOfDay === 'night' ? d.nightIntensity : d.dayIntensity;
  }
}

// ──────────────────────────────────────────────
// Zone ambience + random events
// ──────────────────────────────────────────────

const eventCooldown = { city: 0, forest: 0, lake: 0 };
function updateZoneAmbience(zone, dt) {
  if (zone !== curZone) {
    curZone = zone;
    applyZoneLighting(zone);
  }
  for (const k of ZONES) if (eventCooldown[k] > 0) eventCooldown[k] -= dt;
  if (eventCooldown[zone] > 0) return;
  if (Math.random() < 0.01) {
    eventCooldown[zone] = 25;
    triggerRandomEvent(zone);
  }
}
const eventEntities = [];
const crossingAnimals = []; // 横穿路面的小动物

function spawnCrossingAnimal(zone) {
  // 在出租车前方路肩一侧生成，横穿车道
  const ahead = new THREE.Vector3(Math.sin(taxi.heading), 0, Math.cos(taxi.heading)).multiplyScalar(14);
  const cx = Math.round(taxi.pos.x + ahead.x);
  const cz = Math.round(taxi.pos.z + ahead.z);
  const side = Math.random() < 0.5 ? -1 : 1;
  const startX = cx + side * (ROAD_HALF_W + 2);
  const startZ = cz;
  const gy = heightAt(startX, startZ);
  if (gy <= 2) return;
  const g = new THREE.Group();
  // 随机一种动物造型
  const kinds = ['deer', 'fox', 'cat', 'dog'];
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
  const palette = { deer: 0x9b6b3a, fox: 0xd8703a, cat: 0x6a6a6a, dog: 0xc8a878 };
  const col = palette[kind];
  const mat = new THREE.MeshLambertMaterial({ color: col });
  const darkMat = new THREE.MeshLambertMaterial({ color: kind === 'fox' ? 0xffffff : 0x4a3a2a });
  const body = new THREE.Mesh(boxGeo, mat);
  body.scale.set(0.45, 0.45, 0.95); body.position.y = 0.55; g.add(body);
  const head = new THREE.Mesh(boxGeo, mat);
  head.scale.set(0.38, 0.38, 0.38); head.position.set(0, 0.7, 0.6); g.add(head);
  // 耳朵
  const ear = new THREE.Mesh(boxGeo, mat); ear.scale.set(0.12, 0.18, 0.1); ear.position.set(-0.12, 0.92, 0.55); g.add(ear);
  const ear2 = ear.clone(); ear2.position.x = 0.12; g.add(ear2);
  // 腿（四条）
  for (const [lx, lz] of [[-0.18, 0.35], [0.18, 0.35], [-0.18, -0.35], [0.18, -0.35]]) {
    const legm = new THREE.Mesh(boxGeo, darkMat); legm.scale.set(0.12, 0.4, 0.12); legm.position.set(lx, 0.2, lz); g.add(legm);
  }
  // 尾巴 + 眼睛/鼻子，小动物横穿时更容易识别
  const tail = new THREE.Mesh(boxGeo, kind === 'fox' ? mat : darkMat);
  tail.scale.set(0.14, 0.14, 0.3); tail.position.set(0, 0.55, -0.6); g.add(tail);
  if (kind === 'fox') {
    const tip = new THREE.Mesh(boxGeo, darkMat); tip.scale.set(0.1, 0.1, 0.12); tip.position.set(0, 0.55, -0.82); g.add(tip);
  }
  const eyeMat = new THREE.MeshLambertMaterial({ color: 0x1e1e1e });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(boxGeo, eyeMat); eye.scale.set(0.04, 0.04, 0.02); eye.position.set(sx * 0.11, 0.78, 0.8); g.add(eye);
  }
  const nose = new THREE.Mesh(boxGeo, eyeMat); nose.scale.set(0.06, 0.04, 0.03); nose.position.set(0, 0.68, 0.82); g.add(nose);
  // 朝向横穿方向
  g.rotation.y = side < 0 ? 0 : Math.PI;
  g.position.set(startX, gy + 0.6, startZ);
  scene.add(g);
  const animal = {
    mesh: g, kind, dir: -side, life: 5, paused: 0, hit: false,
    speed: kind === 'cat' ? 2.2 : 1.4, zone,
  };
  crossingAnimals.push(animal);
  toast('小动物横穿', `${ZONE_NAMES[zone]}：${kind === 'deer' ? '小鹿' : kind === 'fox' ? '狐狸' : kind === 'cat' ? '野猫' : '野狗'}横穿路面，5秒后自动离开`, 'warn');
}

function triggerRandomEvent(zone) {
  if (zone === 'city') {
    const gx = Math.round(taxi.pos.x) + 4, gz = Math.round(taxi.pos.z) + 3;
    const gy = heightAt(gx, gz);
    const stall = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xd8a060 }));
    stall.position.set(gx, gy + 0.5, gz); stall.scale.set(1.4, 1, 1.4);
    addDyn(stall, { temp: 12 });
    toast('随机事件', '市井段：路边临时占道摆摊，注意减速', 'warn');
  } else if (zone === 'forest') {
    spawnCrossingAnimal(zone);
  } else if (zone === 'lake') {
    spawnCrossingAnimal(zone);
  } else if (zone === 'field') {
    spawnCrossingAnimal(zone);
  }
}

function updateCrossingAnimals(dt) {
  for (let i = crossingAnimals.length - 1; i >= 0; i -= 1) {
    const a = crossingAnimals[i];
    a.life -= dt;
    // 玩家车辆靠近 <10 格：停顿1秒（不重置计时器）
    const d = Math.hypot(a.mesh.position.x - taxi.pos.x, a.mesh.position.z - taxi.pos.z);
    if (d < 10 && a.paused < 1 && !a.hit) {
      a.paused += dt;
      // 停顿期间不动
    } else {
      // 横穿行走
      a.mesh.position.x += a.dir * a.speed * dt;
      a.mesh.position.y = heightAt(a.mesh.position.x, a.mesh.position.z) + 0.6;
      // 腿部摆动（children[4..7] 为四条腿）
      const swing = Math.sin(performance.now() * 0.018) * 0.25;
      for (let li = 4; li <= 7; li += 1) {
        const legm = a.mesh.children[li];
        if (legm) legm.rotation.x = (li % 2 === 0 ? swing : -swing);
      }
    }
    // 撞击判定（距离<1.5 且未撞击过）
    if (!a.hit && d < 1.6) {
      a.hit = true;
      gov.complaints += 1;
      gov.coins = Math.max(0, gov.coins - 5);
      logEvent('车辆撞到动物', '扣 5 金币 · 评分下降（不卡路）', 'bad');
      toast('撞到动物', '-5 金币，注意避让', 'bad');
    }
    // 5秒到点强制移除（无论位置）
    if (a.life <= 0) {
      scene.remove(a.mesh);
      crossingAnimals.splice(i, 1);
    }
  }
}

// ──────────────────────────────────────────────
// Input
// ──────────────────────────────────────────────

const overlay = document.getElementById('overlay');
const driveHint = document.getElementById('driveHint');
function requestLock() { renderer.domElement.requestPointerLock(); }
let dragging = false, lastMouseX = 0, lastMouseY = 0;
function lookBy(dx, dy) {
  player.yaw -= dx * 0.005; player.pitch -= dy * 0.005;
  player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch));
}
addEventListener('mousemove', (e) => {
  if (mode !== 'foot' || !started) return;
  if (locked) lookBy(e.movementX, e.movementY);
  else if (dragging) { lookBy(e.clientX - lastMouseX, e.clientY - lastMouseY); lastMouseX = e.clientX; lastMouseY = e.clientY; }
});
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('mousedown', (e) => {
  if (mode !== 'foot' || !started) return;
  if (!locked) { dragging = true; lastMouseX = e.clientX; lastMouseY = e.clientY; if (!document.pointerLockElement) requestLock(); }
  handleBlockAction(e);
});
addEventListener('mouseup', () => { dragging = false; });
renderer.domElement.addEventListener('click', () => { if (mode === 'foot' && started && !locked) requestLock(); });

addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  if (e.code === 'KeyF') toggleDrive();
  if (e.code === 'KeyR') resetWorld();
  if (e.code === 'KeyN') toggleDayNight();
  if (e.code === 'KeyV' && mode === 'drive') {
    const views = ['chase', 'cockpit', 'top'];
    driveView = views[(views.indexOf(driveView) + 1) % views.length];
    driveCamReady = false;
    toast('驾驶视角', driveView === 'cockpit' ? '车内方向盘视角' : driveView === 'top' ? '俯视视角' : '跟车尾视角', '');
  }
  if (e.code === 'KeyT' && mode === 'drive') {
    autoDrive = !autoDrive;
    if (autoDrive) {
      autoTargetIdx = nearestRouteIdx();
      autoBridgePath = []; autoBridgeIdx = 0; autoBridgeResume = false;
      autoTaskPath = []; autoTaskIdx = 0;
      autoStuckTimer = 0; autoLastPos.copy(taxi.pos);
      if (npcs.length && npcs.every(n => n.state === 'done')) startBridgeCrossing(false);
      else toast('自动驾驶', '已开启 · 接送乘客，送达后会过桥去对岸', 'good');
    } else {
      autoBridgePath = []; autoBridgeIdx = 0; autoBridgeResume = false;
      autoTaskPath = []; autoTaskIdx = 0;
      toast('自动驾驶', '已关闭 · 手动驾驶', '');
    }
  }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  document.body.classList.toggle('locked', locked && mode === 'foot');
});

function startGame(gm) {
  gameMode = gm;
  started = true;
  overlay.classList.add('hidden');
  toast(gm === 'timed' ? '限时模式' : '自由模式', gm === 'timed' ? '按时送达，超时乘客会抱怨' : '随意接送探索，无时间压力', 'good');
  try { requestLock(); } catch (e) {}
}
document.getElementById('playFree')?.addEventListener('click', () => startGame('free'));
document.getElementById('playTimed')?.addEventListener('click', () => startGame('timed'));
document.getElementById('nightBtn')?.addEventListener('click', toggleDayNight);

function toggleDrive() {
  if (mode === 'foot') {
    const d = Math.hypot(taxi.pos.x - player.pos.x, taxi.pos.z - player.pos.z);
    if (d > 4) { toast('上车失败', '靠近黄色出租车再按 F', 'warn'); return; }
    mode = 'drive';
    if (document.pointerLockElement) document.exitPointerLock();
    document.body.classList.remove('locked');
    driveHint.classList.add('show');
    driveCamReady = false;
    manualForwardHold = 0; manualBoostShown = false; hidePassengerDialog();
    logEvent('司机上岗', '司机上车，开始营业');
  } else {
    mode = 'foot';
    player.pos.set(taxi.pos.x + 1.5, taxi.pos.y + 0.5, taxi.pos.z);
    player.vel.set(0, 0, 0);
    driveCamReady = false;
    manualForwardHold = 0; manualBoostShown = false;
    driveHint.classList.remove('show');
    logEvent('司机下车', '司机下车');
    requestLock();
  }
}

document.getElementById('auditBtn')?.addEventListener('click', () => {
  logEvent('运行审计', `审计：压单率 ${pressRate()}% · 公平指数 ${fairnessIndex()} · 满意度 ${satisfaction()}%`);
  toast('审计完成', `已完成 ${gov.completed} 单 · 收入 ${gov.coins}`, 'good');
});
document.getElementById('verifyBtn')?.addEventListener('click', verifyChain);
document.getElementById('tamperBtn')?.addEventListener('click', () => {
  gov.chainTampered = !gov.chainTampered; gov.chainVerified = false; renderChain();
  toast('证据链', gov.chainTampered ? '已模拟篡改' : '篡改已撤销', gov.chainTampered ? 'bad' : '');
});
document.getElementById('appealBtn')?.addEventListener('click', () => {
  const warned = npcs.find(n => n.warned && n.state === 'waiting');
  if (!warned) { toast('申诉', '暂无压单订单可申诉', 'warn'); return; }
  gov.appeals += 1; warned.warned = false;
  logEvent('申诉提交', `${warned.id} 压单申诉已提交 (第 ${gov.appeals} 件)`);
  toast('申诉已提交', `${warned.id} · 取证中`, '');
});

document.addEventListener('visibilitychange', () => { if (document.hidden && document.exitPointerLock) document.exitPointerLock(); });
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// ──────────────────────────────────────────────
// Reset
// ──────────────────────────────────────────────

function safeSpawn() {
  const s = routePoints[0];
  // 直接出生在场站路面正上方，并清空周围一圈方块确保绝不卡墙
  const gx = s.x, gz = s.z;
  let gy = heightAt(gx, gz);
  // 强制路面并清空头顶两层 + 周围一格的障碍
  setBlock(gx, gy, gz, C.road);
  for (let dx = -1; dx <= 1; dx += 1)
    for (let dz = -1; dz <= 1; dz += 1)
      for (let dy = 1; dy <= 3; dy += 1) delBlock(gx + dx, gy + dy, gz + dz);
  rebuildInstances();
  return { x: gx + 0.5, y: gy + 1.2, z: gz + 0.5 };
}
function resetWorld() {
  for (const d of [...dynMeshes]) scene.remove(d.mesh);
  for (const a of roadAnimals) scene.remove(a.mesh);
  for (const p of pedestrians) scene.remove(p.mesh);
  roadAnimals.length = 0; pedestrians.length = 0; blockCount = 0;
  wanderers.length = 0;
  dynMeshes.length = 0; eventEntities.length = 0;
  generateWorld();
  placeTaxiAtStation();
  placeRoadAnimals();
  placePedestrians();
  for (const n of npcs) { n.state = 'waiting'; n.waitTime = 0; n.warned = false; n.timed = false; n.complained = false; n.showAt(n.pickup); }
  ridingNPC = null; destBeacon.hide();
  autoDrive = false; autoTargetIdx = 0; autoBridgePath = []; autoBridgeIdx = 0; autoBridgeResume = false; autoTaskPath = []; autoTaskIdx = 0; driveCamReady = false;
  autoStuckTimer = 0; autoLastPos.copy(taxi.pos);
  manualForwardHold = 0; manualBoostShown = false; hidePassengerDialog();
  driveSteerInput = 0; driveSteerVisual = 0; steeringWheelAngle = 0;
  logEvent('世界重置', '环线世界已重新生成');
  toast('世界重置', '环线与风景刷新', '');
}

// ──────────────────────────────────────────────
// Main loop
// ──────────────────────────────────────────────

let last = performance.now(), fpsT = 0, fpsF = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (mode === 'foot') updateFoot(dt); else updateDrive(dt);
  for (const c of clouds) { c.position.x += c.userData.speed * dt; if (c.position.x > HALF + 20) c.position.x = -HALF - 20; }
  for (const n of npcs) {
    if (n.mesh.visible) { n.marker.position.y = 2.0 + Math.sin(now * 0.004 + n.id.charCodeAt(2)) * 0.2; n.marker.children[1].rotation.y += dt * 1.5; }
  }
  // 动态实体（船/风车/临时摊位）
  for (const d of dynMeshes) {
    if (d.isBoat) { d.mesh.position.x += dt * 1.5; if (d.mesh.position.x > LAKE_A - 2) d.mesh.position.x = -LAKE_A + 2; }
    else if (d.isWindmill) d.mesh.rotation.z += dt * 1.2;
    else if (d.temp !== undefined) { d.temp -= dt; if (d.temp <= 0) scene.remove(d.mesh); }
  }
  // 横穿路面的小动物
  updateCrossingAnimals(dt);
  // 固定动物挡路 + 路人 NPC + 主题区漫游
  updateRoadAnimals(dt);
  updatePedestrians(dt);
  updateWanderers(dt);
  // 乘客下车动画
  updateDisembarking(dt);
  fpsT += dt; fpsF += 1;
  if (fpsT > 0.5) { fpsT = 0; fpsF = 0; }
  renderHUD(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

// ──────────────────────────────────────────────
// Boot
// ──────────────────────────────────────────────

function boot() {
  const step = (name, fn) => { try { fn(); console.log('[boot] OK', name); } catch (e) { console.error('[boot] FAIL', name, e); showErr(`${name}: ${e.message}\n${e.stack}`); throw e; } };
  step('generateWorld', generateWorld);
  step('buildTaxiMesh', buildTaxiMesh);
  step('placeTaxiAtStation', placeTaxiAtStation);
  step('spawnNPCs', spawnNPCs);
  step('placeRoadAnimals', placeRoadAnimals);
  step('placePedestrians', placePedestrians);
  step('safeSpawn', () => { const sp = safeSpawn(); player.pos.set(sp.x, sp.y, sp.z); player.yaw = 0; });
  step('applyZoneLighting', () => applyZoneLighting('city'));
  step('hud', () => { logEvent('系统就绪', '环线就绪 · 3 位乘客候车 · 出租车停在场站'); renderChain(); });
  console.log('[公平派单·体素世界] 环线版 就绪');
  requestAnimationFrame(loop);
}
boot();
