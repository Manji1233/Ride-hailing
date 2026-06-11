/* ═══════════════════════════════════════════════════════
   Fair Dispatch OS — Dala.md Dark Cosmic Style
   Interactive app with particle constellation, toast, scroll animations
   ═══════════════════════════════════════════════════════ */

// ──────────────────────────────────────────────
// Data Models
// ──────────────────────────────────────────────

let drivers = [
  { id: "D-018", name: "李师傅", distance: 1.1, idle: 18, fairnessDebt: 32, serviceScore: 96, radius: "2.5km", status: "空闲可接", x: 2, y: 1, online: true, canServe: true, heading: "东" },
  { id: "D-027", name: "王师傅", distance: 0.7, idle: 4, fairnessDebt: 10, serviceScore: 91, radius: "1.8km", status: "空闲可接", x: 4, y: 2, online: true, canServe: false, heading: "南" },
  { id: "D-063", name: "周师傅", distance: 2.4, idle: 27, fairnessDebt: 45, serviceScore: 88, radius: "3.0km", status: "空闲可接", x: 6, y: 4, online: true, canServe: true, heading: "西" },
  { id: "D-096", name: "陈师傅", distance: 1.8, idle: 9, fairnessDebt: 18, serviceScore: 94, radius: "2.2km", status: "刚完成订单", x: 1, y: 4, online: true, canServe: true, heading: "北" }
];

const orders = [
  { id: "O-20260606-001", passenger: "金融街 → 市民医院", wait: 112, poolDelay: 68, dispatchDelay: 44, issue: "疑似压单", duplicate: false, civic: true, pickup: { x: 3, y: 2 }, dropoff: { x: 5, y: 4 }, price: 38, minute: 8 },
  { id: "O-20260606-002", passenger: "科技园 → 火车站", wait: 83, poolDelay: 22, dispatchDelay: 61, issue: "派单过慢", duplicate: false, civic: false, pickup: { x: 1, y: 1 }, dropoff: { x: 7, y: 5 }, price: 52, minute: 18 },
  { id: "O-20260606-003", passenger: "学校南门 → 儿童医院", wait: 146, poolDelay: 91, dispatchDelay: 55, issue: "民生时段保障", duplicate: false, civic: true, pickup: { x: 2, y: 5 }, dropoff: { x: 6, y: 2 }, price: 31, minute: 22 },
  { id: "O-20260606-004", passenger: "会展中心 → 老城东", wait: 66, poolDelay: 14, dispatchDelay: 52, issue: "疑似一单两买", duplicate: true, civic: false, pickup: { x: 6, y: 1 }, dropoff: { x: 2, y: 3 }, price: 45, minute: 26 }
];

let orderEvents = [
  { id: "E-001", time: "08:00:01", orderId: "O-20260606-001", source: "Passenger API", type: "ORDER_CREATED", summary: "乘客提交金融街到市民医院订单" },
  { id: "E-002", time: "08:01:09", orderId: "O-20260606-001", source: "Pool Service", type: "ORDER_ENTER_POOL", summary: "订单 68 秒后进入派单池，超过 45 秒阈值" },
  { id: "E-003", time: "08:01:52", orderId: "O-20260606-001", source: "Risk Engine", type: "PRESS_ORDER_WARNING", summary: "系统标记疑似压单，要求扩大服务半径" },
  { id: "E-004", time: "08:02:06", orderId: "O-20260606-004", source: "Fingerprint", type: "FINGERPRINT_CONFLICT", summary: "相似订单在外部平台重复出现" },
  { id: "E-005", time: "08:02:18", orderId: "O-20260606-003", source: "Civic Guard", type: "DISPATCH_ATTEMPTED", summary: "民生保障订单触发优先派单" }
];

const platformOrders = [
  { platform: "平台 A", id: "A-7781", route: "会展中心 → 老城东", minute: 26, price: 45, driverLocked: "D-096" },
  { platform: "平台 B", id: "B-5510", route: "会展中心 → 老城东", minute: 29, price: 47, driverLocked: "B-Driver-21" },
  { platform: "平台 C", id: "C-8812", route: "金融街 → 市民医院", minute: 9, price: 38, driverLocked: "无" },
  { platform: "平台 A", id: "A-8802", route: "学校南门 → 儿童医院", minute: 22, price: 31, driverLocked: "D-063" }
];

let appeals = [
  { id: "AP-001", type: "乘客压单申诉", creator: "乘客", orderId: "O-20260606-001", statusIndex: 1, evidence: "创建后 68 秒才入池" },
  { id: "AP-002", type: "司机未派单申诉", creator: "司机 D-063", orderId: "O-20260606-003", statusIndex: 2, evidence: "司机空闲 27 分钟且在服务半径内" }
];

const appealStatuses = ["已提交", "取证中", "平台待解释", "已裁定"];

const state = {
  lastDispatchIndex: 0,
  auditRuns: 0,
  activeRole: "passenger",
  mapTick: 0,
  chainVerified: false,
  chainTampered: false,
  lastDispatchOrderId: null
};

let weights = {
  distance: 0.32,
  passengerWait: 0.26,
  driverIdle: 0.2,
  fairnessDebt: 0.15,
  serviceScore: 0.07,
  civicBonus: 8
};

const roleContent = {
  passenger: {
    title: "乘客视角：我的订单是不是被压住了？",
    items: ["看到排队位置、附近司机和预计等待", "看到订单创建、入池、派单的完整链路", "遇到久等、一单两买可一键发起申诉"]
  },
  driver: {
    title: "司机视角：我在线可服务，为什么没收到单？",
    items: ["展示服务半径、空闲时长、可接订单热区", "记录司机可服务但未派单的异常证据", "查看每次派单算法给自己的得分"]
  },
  regulator: {
    title: "监管视角：平台有没有压单或重复售卖？",
    items: ["查看压单率、公平指数、司机空转率", "校验订单事件 hash chain 是否连续", "比对跨平台订单指纹并跟踪申诉处理"]
  }
};

// ──────────────────────────────────────────────
// Utility Functions
// ──────────────────────────────────────────────

function $(selector) { return document.querySelector(selector); }
function $all(selector) { return [...document.querySelectorAll(selector)]; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function formatSeconds(seconds) {
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes} 分 ${rest} 秒` : `${minutes} 分钟`;
}

function riskLevel(order) {
  if (order.duplicate) return { label: "高风险", className: "danger" };
  if (order.poolDelay > 60 || order.dispatchDelay > 60) return { label: "中风险", className: "warn" };
  return { label: "正常", className: "blue" };
}

// ──────────────────────────────────────────────
// Toast Notification System
// ──────────────────────────────────────────────

function showToast(title, message, duration = 3500) {
  const container = $("#toastContainer");
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `<div class="toast-title">${title}</div><div>${message}</div>`;
  container.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add("show"));
  });

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ──────────────────────────────────────────────
// Animated Number Counter
// ──────────────────────────────────────────────

function animateValue(element, start, end, duration = 800, suffix = "") {
  const startTime = performance.now();
  const isFloat = String(end).includes(".");

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    const current = start + (end - start) * eased;
    element.textContent = (isFloat ? current.toFixed(1) : Math.round(current)) + suffix;
    if (progress < 1) requestAnimationFrame(update);
  }

  requestAnimationFrame(update);
}

// ──────────────────────────────────────────────
// Particle Constellation Engine
// ──────────────────────────────────────────────

class ParticleConstellation {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.particles = [];
    this.mouse = { x: -1000, y: -1000 };
    this.running = true;
    this.dpr = window.devicePixelRatio || 1;

    const colors = ["#8052ff", "#8052ff", "#ffb829", "#15846e", "#ffffff", "#ffffff", "#ffffff"];
    const shapes = ["triangle", "circle", "diamond", "square"];

    this.resize();

    // Create particles
    const count = Math.min(Math.floor((this.width * this.height) / 3000), 400);
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: 1.5 + Math.random() * 3.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        shape: shapes[Math.floor(Math.random() * shapes.length)],
        alpha: 0.15 + Math.random() * 0.45,
        baseAlpha: 0.15 + Math.random() * 0.45,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: 0.005 + Math.random() * 0.015
      });
    }

    // Mouse tracking
    window.addEventListener("mousemove", (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });

    window.addEventListener("resize", () => this.resize());

    this.animate();
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.canvas.style.width = this.width + "px";
    this.canvas.style.height = this.height + "px";
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  drawShape(ctx, particle) {
    const { x, y, size, shape } = particle;
    ctx.beginPath();
    switch (shape) {
      case "triangle":
        ctx.moveTo(x, y - size);
        ctx.lineTo(x - size * 0.87, y + size * 0.5);
        ctx.lineTo(x + size * 0.87, y + size * 0.5);
        ctx.closePath();
        break;
      case "diamond":
        ctx.moveTo(x, y - size);
        ctx.lineTo(x + size * 0.7, y);
        ctx.lineTo(x, y + size);
        ctx.lineTo(x - size * 0.7, y);
        ctx.closePath();
        break;
      case "square":
        ctx.rect(x - size * 0.6, y - size * 0.6, size * 1.2, size * 1.2);
        break;
      default: // circle
        ctx.arc(x, y, size, 0, Math.PI * 2);
        break;
    }
  }

  animate() {
    if (!this.running) return;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    // Update and draw particles
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.pulse += p.pulseSpeed;
      p.alpha = p.baseAlpha + Math.sin(p.pulse) * 0.1;

      // Wrap around
      if (p.x < -10) p.x = this.width + 10;
      if (p.x > this.width + 10) p.x = -10;
      if (p.y < -10) p.y = this.height + 10;
      if (p.y > this.height + 10) p.y = -10;

      // Mouse interaction — push away gently
      const dx = p.x - this.mouse.x;
      const dy = p.y - this.mouse.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 150) {
        const force = (150 - dist) / 150 * 0.5;
        p.vx += (dx / dist) * force * 0.1;
        p.vy += (dy / dist) * force * 0.1;
        p.alpha = Math.min(p.baseAlpha + 0.3, 1);
      }

      // Dampen velocity
      p.vx *= 0.995;
      p.vy *= 0.995;

      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      this.drawShape(ctx, p);
      ctx.fill();
    }

    // Draw connection lines between nearby particles
    ctx.strokeStyle = "#8052ff";
    ctx.lineWidth = 0.3;
    for (let i = 0; i < this.particles.length; i++) {
      for (let j = i + 1; j < this.particles.length; j++) {
        const a = this.particles[i];
        const b = this.particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 80) {
          ctx.globalAlpha = (1 - dist / 80) * 0.08;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    ctx.globalAlpha = 1;
    requestAnimationFrame(() => this.animate());
  }
}

// ──────────────────────────────────────────────
// Glow Cursor
// ──────────────────────────────────────────────

function initGlowCursor() {
  const glow = $("#glowCursor");
  if (!glow) return;

  document.addEventListener("mousemove", (e) => {
    glow.style.left = e.clientX + "px";
    glow.style.top = e.clientY + "px";
  });
}

// ──────────────────────────────────────────────
// Scroll-triggered Animations
// ──────────────────────────────────────────────

function initScrollAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
      }
    });
  }, {
    threshold: 0.08,
    rootMargin: "0px 0px -40px 0px"
  });

  $all(".animate-in").forEach((el) => observer.observe(el));
}

// ──────────────────────────────────────────────
// Keyboard Shortcuts
// ──────────────────────────────────────────────

function initKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    // Only trigger if not typing in an input
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    switch (e.key.toLowerCase()) {
      case "d":
        e.preventDefault();
        runDispatchSimulation();
        showToast("快捷键", "D — 模拟派单", 2000);
        break;
      case "a":
        e.preventDefault();
        runAudit();
        showToast("快捷键", "A — 运行审计", 2000);
        break;
      case "m":
        e.preventDefault();
        advanceLocationTick();
        showToast("快捷键", "M — 推进地图 30 秒", 2000);
        break;
      case "v":
        e.preventDefault();
        verifyAuditChain();
        showToast("快捷键", "V — 校验证据链", 2000);
        break;
      case "1":
        e.preventDefault();
        state.activeRole = "passenger";
        renderRolePanel();
        showToast("角色切换", "乘客视角", 2000);
        break;
      case "2":
        e.preventDefault();
        state.activeRole = "driver";
        renderRolePanel();
        showToast("角色切换", "司机视角", 2000);
        break;
      case "3":
        e.preventDefault();
        state.activeRole = "regulator";
        renderRolePanel();
        showToast("角色切换", "监管视角", 2000);
        break;
      case "?":
        showToast("快捷键", "D=派单 A=审计 M=地图 V=校验 1/2/3=角色", 4000);
        break;
    }
  });
}

// ──────────────────────────────────────────────
// Business Logic — Scoring & Dispatch
// ──────────────────────────────────────────────

function scoreDriver(driver, order) {
  const distanceScore = clamp(100 - driver.distance * 24, 0, 100);
  const waitScore = clamp(order.wait / 1.8, 0, 100);
  const idleScore = clamp(driver.idle * 3.2, 0, 100);
  const fairnessScore = clamp(driver.fairnessDebt * 1.8, 0, 100);
  const serviceScore = driver.serviceScore;
  const civicBonus = order.civic ? weights.civicBonus : 0;

  const total =
    distanceScore * weights.distance +
    waitScore * weights.passengerWait +
    idleScore * weights.driverIdle +
    fairnessScore * weights.fairnessDebt +
    serviceScore * weights.serviceScore +
    civicBonus;

  return {
    driver,
    total: Number(total.toFixed(2)),
    parts: {
      distanceScore: Number(distanceScore.toFixed(1)),
      waitScore: Number(waitScore.toFixed(1)),
      idleScore: Number(idleScore.toFixed(1)),
      fairnessScore: Number(fairnessScore.toFixed(1)),
      serviceScore,
      civicBonus
    }
  };
}

function dispatchOrder(order) {
  return drivers
    .filter(driver => driver.online && driver.canServe)
    .map(driver => scoreDriver(driver, order))
    .sort((a, b) => b.total - a.total);
}

// ──────────────────────────────────────────────
// Render Functions
// ──────────────────────────────────────────────

function renderRolePanel() {
  const role = roleContent[state.activeRole];
  $("#rolePanel").innerHTML = `
    <div class="role-panel-grid">
      <div>
        <p class="eyebrow">${state.activeRole.toUpperCase()}</p>
        <h3>${role.title}</h3>
        <ul class="check-list">${role.items.map(item => `<li>${item}</li>`).join("")}</ul>
      </div>
      <div class="role-proof">
        <strong>当前证据摘要</strong>
        <span>压单预警：${orders.filter(order => order.poolDelay > 60).length} 单</span>
        <span>附近可服务司机：${drivers.filter(driver => driver.online && driver.canServe).length} 位</span>
        <span>一单两买风险：${orders.filter(order => order.duplicate).length} 单</span>
      </div>
    </div>
  `;
  $all(".role-tab").forEach(button => button.classList.toggle("active", button.dataset.role === state.activeRole));
}

function renderPassengerStatus() {
  const rows = [
    ["订单已创建", "112 秒前创建，已生成订单指纹", "正常"],
    ["进入派单池", "创建后 68 秒入池，超过建议阈值 45 秒", "偏慢"],
    ["首次派单", "尚未完成，系统应继续扩大服务半径", "待处理"],
    ["一单两买检测", "未发现重复司机锁单，持续监测跨平台冲突", "安全"]
  ];

  $("#passengerStatus").innerHTML = rows.map(([title, desc, badge], index) => `
    <article class="status-item animate-in visible">
      <header><strong>${index + 1}. ${title}</strong><span class="badge ${badge === "偏慢" ? "warn" : badge === "待处理" ? "blue" : ""}">${badge}</span></header>
      <small>${desc}</small>
    </article>
  `).join("");
}

function renderDrivers() {
  $("#driverList").innerHTML = drivers.map(driver => `
    <article class="driver-item">
      <header><strong>${driver.name} <small>${driver.id}</small></strong><span class="badge ${driver.canServe ? "blue" : "warn"}">${driver.status}</span></header>
      <small>网格坐标 (${driver.x}, ${driver.y}) · 朝${driver.heading} · 服务半径 ${driver.radius}</small>
      <small>距离最近订单 ${driver.distance}km · 空闲 ${driver.idle} 分钟 · 公平补偿分 ${driver.fairnessDebt} · 服务分 ${driver.serviceScore}</small>
    </article>
  `).join("");
}

function renderMetrics() {
  const pressRate = 18 + state.auditRuns * 2;
  const fairness = Math.max(70, 86 - state.auditRuns);
  const avgWait = 5.4 + state.auditRuns * 0.3;
  const duplicateRisk = orders.filter(order => order.duplicate).length;
  const metrics = [
    ["压单率", `${pressRate}%`, "创建后超过 45 秒未入池的订单占比"],
    ["公平派单指数", `${fairness}/100`, "越高代表司机接单机会越均衡"],
    ["平均等待", `${avgWait.toFixed(1)} 分钟`, "乘客从创建订单到司机接单的平均时间"],
    ["一单两买风险", `${duplicateRisk} 单`, "同一订单指纹出现多平台或多司机冲突"]
  ];

  $("#metricGrid").innerHTML = metrics.map(([label, value, desc]) => `
    <article class="metric-card"><span>${label}</span><strong>${value}</strong><p>${desc}</p></article>
  `).join("");

  // Animate metric numbers
  const metricEls = $all(".metric-card strong");
  metricEls.forEach((el) => {
    el.style.opacity = "0";
    el.style.transform = "translateY(10px)";
    setTimeout(() => {
      el.style.transition = "all 0.5s cubic-bezier(0.16, 1, 0.3, 1)";
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
    }, 100);
  });
}

function renderOrderTable() {
  $("#orderTable").innerHTML = orders.map(order => {
    const risk = riskLevel(order);
    const evidence = order.duplicate ? "订单指纹在外部渠道重复出现" : order.poolDelay > 60 ? "创建到入池超过阈值" : "派单响应超过建议阈值";
    return `
      <tr>
        <td><strong>${order.id}</strong><br><small>${order.passenger}</small></td>
        <td>${order.issue}</td>
        <td>${formatSeconds(order.poolDelay)}</td>
        <td>${formatSeconds(order.dispatchDelay)}</td>
        <td><span class="badge ${risk.className}">${risk.label}</span></td>
        <td>${evidence}</td>
      </tr>
    `;
  }).join("");
}

function renderOrderPool() {
  $("#orderPool").innerHTML = [...orders]
    .sort((a, b) => b.wait - a.wait)
    .map(order => {
      const risk = riskLevel(order);
      return `
        <article class="order-item">
          <header><strong>${order.passenger}</strong><span class="badge ${risk.className}">${risk.label}</span></header>
          <small>${order.id} · 已等待 ${formatSeconds(order.wait)} · ${order.civic ? "民生保障订单" : "普通订单"}</small>
        </article>
      `;
    }).join("");
}

function renderCityMap() {
  const width = 8;
  const height = 6;
  const activeOrder = orders[state.lastDispatchIndex % orders.length];
  const cells = [];

  for (let y = 1; y <= height; y += 1) {
    for (let x = 1; x <= width; x += 1) {
      const marks = [];
      if ((x === 4 && y === 3) || (x === 5 && y === 3)) marks.push("H");
      if (activeOrder.pickup.x === x && activeOrder.pickup.y === y) marks.push("P");
      if (activeOrder.dropoff.x === x && activeOrder.dropoff.y === y) marks.push("G");
      drivers.filter(driver => driver.x === x && driver.y === y).forEach(driver => marks.push(driver.canServe ? "D" : "d"));
      const isActive = marks.length > 0;
      cells.push(`<div class="map-cell ${isActive ? "active" : ""}" data-x="${x}" data-y="${y}"><span>${marks.join("") || "·"}</span><small>${x},${y}</small></div>`);
    }
  }

  $("#cityMap").innerHTML = cells.join("");
  $("#mapTick").textContent = `T+${state.mapTick} 秒`;
}

function renderLocationLog() {
  const activeOrder = orders[state.lastDispatchIndex % orders.length];
  const nearby = drivers.filter(driver => driver.online && driver.canServe).map(driver => `${driver.name}(${driver.x},${driver.y})`).join("、");
  const rows = [
    ["乘客位置", `${activeOrder.passenger} 上车点位于 (${activeOrder.pickup.x}, ${activeOrder.pickup.y})`],
    ["可服务司机", nearby || "暂无"],
    ["异常解释", "若附近司机可服务但无派单事件，系统会生成未派单异常证据"],
    ["民用保障", activeOrder.civic ? "当前订单触发医院/学校等民生保障加分" : "当前订单为普通时段订单"]
  ];
  $("#locationLog").innerHTML = rows.map(([title, text]) => `<article class="timeline-item"><b>${title}</b><span>${text}</span></article>`).join("");
}

function advanceLocationTick() {
  state.mapTick += 30;
  drivers = drivers.map((driver, index) => {
    const shift = index % 2 === 0 ? 1 : -1;
    return {
      ...driver,
      x: clamp(driver.x + shift, 1, 8),
      y: clamp(driver.y + (index === 1 ? 1 : 0), 1, 6),
      idle: driver.idle + 0.5,
      canServe: index === 1 ? state.mapTick % 60 === 0 : driver.canServe
    };
  });
  appendEvent("Location Service", "DRIVER_LOCATION_UPDATED", "司机位置推进 30 秒，可服务池重新计算", orders[0].id);
  renderCityMap();
  renderLocationLog();
  renderDrivers();
  renderRolePanel();
  showToast("地图更新", `T+${state.mapTick} 秒 — 司机位置已推进`, 2500);
}

function nextEventTime() {
  const minute = String(3 + orderEvents.length).padStart(2, "0");
  return `08:${minute}:00`;
}

function appendEvent(source, type, summary, orderId) {
  orderEvents.unshift({ id: `E-${String(orderEvents.length + 1).padStart(3, "0")}`, time: nextEventTime(), orderId, source, type, summary });
  state.chainVerified = false;
  renderOrderEvents();
  renderAuditChain();
}

function renderOrderEvents() {
  $("#orderEvents").innerHTML = orderEvents.slice(0, 8).map(event => `
    <article class="timeline-item">
      <b>${event.type}</b>
      <span>${event.time} · ${event.source} · ${event.orderId}</span>
      <small>${event.summary}</small>
    </article>
  `).join("");
}

function simpleHash(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `h${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function buildAuditChain() {
  let prevHash = "GENESIS";
  return [...orderEvents].reverse().map((event, index) => {
    const payload = `${prevHash}|${event.id}|${event.time}|${event.orderId}|${event.type}|${event.summary}`;
    const hash = simpleHash(payload);
    const item = { ...event, index: index + 1, prevHash, hash };
    prevHash = hash;
    return item;
  }).reverse();
}

function verifyAuditChain() {
  const chain = buildAuditChain();
  state.chainVerified = !state.chainTampered && chain.every((item, index) => {
    const next = chain[index + 1];
    return !next || next.hash === item.prevHash;
  });
  renderAuditChain();
  if (state.chainVerified) {
    showToast("证据链校验", "全部校验通过 — 事件链完整无篡改", 3000);
  } else if (state.chainTampered) {
    showToast("证据链校验", "⚠ 发现篡改 — 链已断裂", 3500);
  }
}

function renderAuditChain() {
  const chain = buildAuditChain().slice(0, 5);
  const status = state.chainTampered ? "发现篡改" : state.chainVerified ? "校验通过" : "待校验";
  const statusClass = state.chainTampered ? "danger" : state.chainVerified ? "" : "blue";
  $("#auditChain").innerHTML = `
    <div class="chain-status"><span class="badge ${statusClass}">${status}</span></div>
    ${chain.map((item, index) => `
      <article class="chain-item ${state.chainTampered && index === 0 ? "broken" : ""}">
        <strong>${item.type}</strong>
        <span>prev: ${state.chainTampered && index === 0 ? "BROKEN" : item.prevHash}</span>
        <span>hash: ${item.hash}</span>
      </article>
    `).join("")}
  `;
}

function fingerprintOrder(order) {
  return order.route.replace(/\s/g, "").toLowerCase();
}

function compareFingerprints() {
  return platformOrders.map(order => {
    const conflicts = platformOrders.filter(other =>
      other.id !== order.id &&
      other.platform !== order.platform &&
      fingerprintOrder(other) === fingerprintOrder(order) &&
      Math.abs(other.minute - order.minute) <= 8 &&
      Math.abs(other.price - order.price) <= 6
    );
    return { ...order, conflicts, risk: conflicts.length ? "疑似重复" : "正常" };
  });
}

function renderFingerprintMonitor() {
  const rows = compareFingerprints();
  $("#fingerprintMonitor").innerHTML = `
    <div class="panel-head"><strong>跨平台比对结果</strong><span>${rows.filter(row => row.conflicts.length).length} 条风险</span></div>
    <div class="fingerprint-grid">
      ${rows.map(row => `
        <article class="fingerprint-card">
          <header><strong>${row.platform} · ${row.id}</strong><span class="badge ${row.conflicts.length ? "danger" : "blue"}">${row.risk}</span></header>
          <small>${row.route} · ${row.minute} 分钟窗口 · ¥${row.price} · 锁定司机 ${row.driverLocked}</small>
          <span class="hash-chip">fingerprint: ${simpleHash(fingerprintOrder(row)).slice(0, 9)}</span>
          ${row.conflicts.length ? `<small>冲突：${row.conflicts.map(item => `${item.platform}/${item.id}`).join("、")}</small>` : ""}
        </article>
      `).join("")}
    </div>
  `;
}

function renderAppeals() {
  $("#appealList").innerHTML = appeals.map(appeal => {
    const status = appealStatuses[appeal.statusIndex];
    return `
      <article class="appeal-card">
        <header><strong>${appeal.type}</strong><span class="badge ${appeal.statusIndex >= 3 ? "" : "blue"}">${status}</span></header>
        <small>${appeal.id} · ${appeal.creator} · ${appeal.orderId}</small>
        <p>${appeal.evidence}</p>
        <div class="steps">${appealStatuses.map((step, index) => `<span class="${index <= appeal.statusIndex ? "done" : ""}">${step}</span>`).join("")}</div>
        <button class="secondary tiny" data-advance-appeal="${appeal.id}">推进处理</button>
      </article>
    `;
  }).join("");
}

function createAppeal(type) {
  const order = type.includes("一单") ? orders[3] : type.includes("司机") ? orders[2] : orders[0];
  const appeal = {
    id: `AP-${String(appeals.length + 1).padStart(3, "0")}`,
    type,
    creator: type.includes("司机") ? "司机 D-063" : "乘客",
    orderId: order.id,
    statusIndex: 0,
    evidence: type.includes("司机") ? "司机在服务半径内但未收到派单" : type.includes("一单") ? "跨平台出现相同订单指纹" : "订单超过阈值仍未首次派单"
  };
  appeals.unshift(appeal);
  appendEvent("Appeal Center", "APPEAL_CREATED", `${appeal.creator} 发起 ${appeal.type}`, appeal.orderId);
  renderAppeals();
  showToast("申诉已创建", `${appeal.type} — ${appeal.id}`, 3000);
}

function advanceAppeal(id) {
  appeals = appeals.map(appeal => appeal.id === id ? { ...appeal, statusIndex: clamp(appeal.statusIndex + 1, 0, appealStatuses.length - 1) } : appeal);
  const appeal = appeals.find(item => item.id === id);
  appendEvent("Appeal Center", "APPEAL_STATUS_UPDATED", `${appeal.id} 进入 ${appealStatuses[appeal.statusIndex]}`, appeal.orderId);
  renderAppeals();
  showToast("申诉推进", `${appeal.id} → ${appealStatuses[appeal.statusIndex]}`, 2500);
}

function runDispatchSimulation() {
  const order = orders[state.lastDispatchIndex % orders.length];
  state.lastDispatchIndex += 1;
  state.lastDispatchOrderId = order.id;
  const ranked = dispatchOrder(order);
  const winner = ranked[0];

  const lines = [
    `订单：${order.id}`,
    `路线：${order.passenger}`,
    `民生保障：${order.civic ? `是，额外 +${weights.civicBonus} 分` : "否"}`,
    "",
    "评分权重：",
    `- 距离 ${(weights.distance * 100).toFixed(0)}%：越近越高`,
    `- 乘客等待 ${(weights.passengerWait * 100).toFixed(0)}%：等得越久越优先`,
    `- 司机空闲 ${(weights.driverIdle * 100).toFixed(0)}%：空驶越久越优先`,
    `- 服务均衡 ${(weights.fairnessDebt * 100).toFixed(0)}%：长期少单司机获得补偿`,
    `- 服务质量 ${(weights.serviceScore * 100).toFixed(0)}%：保留基础服务约束`,
    "",
    "候选司机得分：",
    ...ranked.map((item, index) => {
      const p = item.parts;
      return `${index + 1}. ${item.driver.name} ${item.driver.id}：${item.total} 分 ` +
        `(距离${p.distanceScore} / 等待${p.waitScore} / 空闲${p.idleScore} / 均衡${p.fairnessScore} / 服务${p.serviceScore} / 民生+${p.civicBonus})`;
    }),
    "",
    winner ? `派单结果：派给 ${winner.driver.name}，原因是综合得分最高，同时满足距离、等待与司机均衡约束。` : "派单结果：暂无在线可服务司机，触发扩大服务半径。",
    `审计结论：该单生成可解释日志，可供乘客、司机与监管侧复核。`
  ];

  const logEl = $("#dispatchLog");
  logEl.textContent = lines.join("\n");

  // Typing animation effect
  logEl.style.opacity = "0";
  logEl.style.transform = "translateY(8px)";
  setTimeout(() => {
    logEl.style.transition = "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)";
    logEl.style.opacity = "1";
    logEl.style.transform = "translateY(0)";
  }, 50);

  appendEvent("Dispatch Engine", "DRIVER_NOTIFIED", winner ? `通知 ${winner.driver.name} 接单，得分 ${winner.total}` : "无可服务司机，等待下一轮", order.id);

  if (winner) {
    showToast("派单完成", `${winner.driver.name} — 综合得分 ${winner.total}`, 3000);
  }

  renderCityMap();
  renderLocationLog();
}

function renderAlgorithmConfig() {
  const config = [
    ["distance", "距离权重", weights.distance],
    ["passengerWait", "乘客等待", weights.passengerWait],
    ["driverIdle", "司机空闲", weights.driverIdle],
    ["fairnessDebt", "服务均衡", weights.fairnessDebt],
    ["serviceScore", "服务质量", weights.serviceScore]
  ];
  const total = config.reduce((sum, [, , value]) => sum + value, 0);
  $("#algorithmConfig").innerHTML = `
    <div class="panel-head"><strong>派单算法配置后台</strong><span class="badge ${Math.abs(total - 1) < 0.01 ? "" : "warn"}">权重合计 ${(total * 100).toFixed(0)}%</span></div>
    <div class="config-grid">
      ${config.map(([key, label, value]) => `
        <label class="range-row">
          <span>${label}</span>
          <input type="range" min="0" max="60" value="${Math.round(value * 100)}" data-weight="${key}" />
          <b>${Math.round(value * 100)}%</b>
        </label>
      `).join("")}
      <label class="range-row">
        <span>民生时段加分</span>
        <input type="range" min="0" max="20" value="${weights.civicBonus}" data-civic-bonus="true" />
        <b>+${weights.civicBonus}</b>
      </label>
    </div>
    <p class="hint">调整后点击"模拟下一单派发"，可看到候选司机得分变化。快捷键 D 派单、A 审计、M 推进地图。</p>
  `;
}

function runAudit() {
  state.auditRuns += 1;
  const now = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  $("#auditTime").textContent = `${now} 更新`;
  $("#queueRank").textContent = `第 ${Math.max(1, 4 - state.auditRuns)} 位`;
  appendEvent("Audit Job", "AUDIT_RUN", `第 ${state.auditRuns} 次审计：压单率与公平指数已刷新`, orders[0].id);
  renderMetrics();
  renderOrderTable();
  renderFingerprintMonitor();
  runDispatchSimulation();
  showToast("审计完成", `第 ${state.auditRuns} 次 — 指标已刷新`, 3000);
}

// ──────────────────────────────────────────────
// Interactive Map — Click to inspect cell
// ──────────────────────────────────────────────

function initMapInteraction() {
  document.addEventListener("click", (e) => {
    const cell = e.target.closest(".map-cell");
    if (!cell) return;

    const x = parseInt(cell.dataset.x);
    const y = parseInt(cell.dataset.y);

    // Find entities at this position
    const driverHere = drivers.filter(d => d.x === x && d.y === y);
    const orderPickup = orders.filter(o => o.pickup.x === x && o.pickup.y === y);
    const orderDropoff = orders.filter(o => o.dropoff.x === x && o.dropoff.y === y);

    let info = `网格 (${x}, ${y})`;
    if (driverHere.length) info += ` — ${driverHere.map(d => d.name).join("、")}`;
    if (orderPickup.length) info += ` — 上车点: ${orderPickup.map(o => o.passenger.split("→")[0]).join("、")}`;
    if (orderDropoff.length) info += ` — 下车点: ${orderDropoff.map(o => o.passenger.split("→")[1]).join("、")}`;

    // Highlight cell briefly
    cell.style.background = "rgba(128, 82, 255, 0.25)";
    cell.style.borderColor = "rgba(128, 82, 255, 0.5)";
    setTimeout(() => {
      cell.style.background = "";
      cell.style.borderColor = "";
    }, 600);

    showToast("地图探查", info, 3000);
  });
}

// ──────────────────────────────────────────────
// Auto-ticking location (subtle background motion)
// ──────────────────────────────────────────────

function initAutoTick() {
  // Gently advance driver positions every 8 seconds for a living feel
  setInterval(() => {
    drivers = drivers.map((driver, index) => ({
      ...driver,
      x: clamp(driver.x + (Math.random() > 0.7 ? (index % 2 === 0 ? 1 : -1) : 0), 1, 8),
      y: clamp(driver.y + (Math.random() > 0.8 ? (index % 3 === 0 ? 1 : -1) : 0), 1, 6),
      idle: driver.idle + 0.1
    }));
    // Only re-render map if the section is visible
    const mapSection = $("#mapSimulation");
    if (mapSection && mapSection.getBoundingClientRect().top < window.innerHeight) {
      renderCityMap();
    }
  }, 8000);
}

// ──────────────────────────────────────────────
// Event Binding
// ──────────────────────────────────────────────

function bindEvents() {
  $all("[data-scroll]").forEach(button => {
    button.addEventListener("click", () => document.getElementById(button.getAttribute("data-scroll"))?.scrollIntoView({ behavior: "smooth", block: "start" }));
  });
  $all(".role-tab").forEach(button => button.addEventListener("click", () => { state.activeRole = button.dataset.role; renderRolePanel(); }));
  $("#dispatchBtn").addEventListener("click", runDispatchSimulation);
  $("#refreshBtn").addEventListener("click", runAudit);
  $("#runAuditBtn").addEventListener("click", runAudit);
  $("#advanceMapBtn").addEventListener("click", advanceLocationTick);
  $("#verifyChainBtn").addEventListener("click", verifyAuditChain);
  $("#tamperChainBtn").addEventListener("click", () => {
    state.chainTampered = !state.chainTampered;
    state.chainVerified = false;
    renderAuditChain();
    showToast("证据链", state.chainTampered ? "已模拟篡改 — 链断裂" : "篡改已撤销", 2500);
  });
  $all("[data-appeal]").forEach(button => button.addEventListener("click", () => createAppeal(button.dataset.appeal)));
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-advance-appeal]");
    if (button) advanceAppeal(button.dataset.advanceAppeal);
  });
  document.addEventListener("input", event => {
    const input = event.target;
    if (input.matches("[data-weight]")) {
      weights[input.dataset.weight] = Number(input.value) / 100;
      renderAlgorithmConfig();
    }
    if (input.matches("[data-civic-bonus]")) {
      weights.civicBonus = Number(input.value);
      renderAlgorithmConfig();
    }
  });
}

// ──────────────────────────────────────────────
// Initialization
// ──────────────────────────────────────────────

function init() {
  // Render all panels
  renderRolePanel();
  renderPassengerStatus();
  renderDrivers();
  renderMetrics();
  renderOrderTable();
  renderOrderPool();
  renderCityMap();
  renderLocationLog();
  renderOrderEvents();
  renderAuditChain();
  renderFingerprintMonitor();
  renderAppeals();
  renderAlgorithmConfig();

  // Bind events
  bindEvents();

  // Initialize interactive features
  initScrollAnimations();
  initGlowCursor();
  initMapInteraction();
  initAutoTick();
  initKeyboardShortcuts();

  // Start particle constellation
  const canvas = $("#particleCanvas");
  if (canvas) {
    new ParticleConstellation(canvas);
  }

  // Welcome toast
  setTimeout(() => {
    showToast("Fair Dispatch OS", "按 ? 查看快捷键 · 点击地图网格探查", 4000);
  }, 1500);
}

init();
