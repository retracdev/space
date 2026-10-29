const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Title: resolves from chunky pixels to sharp ---------- */
const TITLE_STEPS = [56, 40, 28, 20, 14, 10, 7, 5, 3, 2, 1]; // pixel sizes, coarse -> sharp
const TITLE_STEP_MS = 95;
const titleCanvas = document.getElementById("title");
const titleCtx = titleCanvas.getContext("2d");
const titleOff = document.createElement("canvas");
const titleOffCtx = titleOff.getContext("2d");
let titlePx = reduceMotion ? 1 : TITLE_STEPS[0];
let titleAlpha = reduceMotion ? 1 : 0;

function titleFont(size) {
  return `700 ${size}px "Space Grotesk", system-ui, sans-serif`;
}

function sizeTitle() {
  const css = getComputedStyle(titleCanvas.parentElement);
  const fs = parseFloat(css.fontSize);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  titleCtx.font = titleFont(fs);
  if ("letterSpacing" in titleCtx) titleCtx.letterSpacing = `${-0.04 * fs}px`;
  const w = Math.ceil(titleCtx.measureText("retrac.space").width + fs * 0.1);
  const h = Math.ceil(fs * 1.3);
  titleCanvas.style.width = w + "px";
  titleCanvas.style.height = h + "px";
  titleCanvas.width = Math.round(w * dpr);
  titleCanvas.height = Math.round(h * dpr);
  titleCanvas.fs = fs * dpr;
}

function drawTitle() {
  const W = titleCanvas.width, H = titleCanvas.height;
  const px = Math.max(1, titlePx * (titleCanvas.width / parseFloat(titleCanvas.style.width)));
  const lw = Math.max(1, Math.ceil(W / px)), lh = Math.max(1, Math.ceil(H / px));
  if (titleOff.width !== lw || titleOff.height !== lh) { titleOff.width = lw; titleOff.height = lh; }

  // render the text small, then stretch it up with smoothing off
  const s = lw / W, fs = titleCanvas.fs * s;
  const c = titleOffCtx;
  c.clearRect(0, 0, lw, lh);
  c.font = titleFont(fs);
  if ("letterSpacing" in c) c.letterSpacing = `${-0.04 * fs}px`;
  c.textBaseline = "middle";
  const x = fs * 0.05, y = lh / 2;
  c.fillStyle = "#f3f0ff";
  c.fillText("retrac", x, y);
  c.fillStyle = "#8b86a3";
  c.fillText(".space", x + c.measureText("retrac").width, y);

  titleCtx.clearRect(0, 0, W, H);
  titleCtx.imageSmoothingEnabled = false;
  titleCtx.globalAlpha = titleAlpha;
  titleCtx.drawImage(titleOff, 0, 0, lw, lh, 0, 0, W, H);
  titleCtx.globalAlpha = 1;
}

function playTitle(done) {
  if (reduceMotion) { drawTitle(); done(); return; }
  const start = performance.now();
  const total = TITLE_STEPS.length * TITLE_STEP_MS;
  const tick = (now) => {
    // rAF's timestamp can land slightly before `start`, so clamp at 0
    const p = Math.min(1, Math.max(0, (now - start) / total));
    titlePx = TITLE_STEPS[Math.min(TITLE_STEPS.length - 1, Math.floor(p * TITLE_STEPS.length))];
    titleAlpha = Math.min(1, p * 3);
    drawTitle();
    if (p < 1) requestAnimationFrame(tick);
    else done();
  };
  requestAnimationFrame(tick);
}

/* ---------- Projects ---------- */
const projects = [
  {
    name: "Retrac Labs",
    video: "assets/retrac-labs-loop.mp4",
    href: "https://retraclabs.io/?utm_source=retrac.space&utm_medium=referral&utm_campaign=personal_site",
  },
  { name: "Coming Soon", scene: "synth" },
];

/* ---------- Scenes: draw(ctx, w, h, t) ---------- */
const rand = (s) => () => (s = (s * 16807) % 2147483647) / 2147483647;

const scenes = {
  nebula() {
    const r = rand(7);
    const stars = Array.from({ length: 80 }, () => [r(), r(), r()]);
    return (c, w, h, t) => {
      c.fillStyle = "#0b0620"; c.fillRect(0, 0, w, h);
      c.globalCompositeOperation = "lighter";
      for (let i = 0; i < 5; i++) {
        const x = w * (0.5 + 0.35 * Math.sin(t * 0.3 + i * 1.7));
        const y = h * (0.5 + 0.3 * Math.cos(t * 0.25 + i * 2.3));
        const g = c.createRadialGradient(x, y, 0, x, y, w * 0.5);
        g.addColorStop(0, `hsla(${(250 + i * 35 + t * 15) % 360},85%,60%,0.55)`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = g; c.fillRect(0, 0, w, h);
      }
      for (const [sx, sy, sp] of stars) {
        c.fillStyle = `rgba(255,255,255,${0.4 + 0.6 * Math.abs(Math.sin(t * 2 + sp * 10))})`;
        const s = Math.max(1, w / 300);
        c.fillRect(sx * w, sy * h, s, s);
      }
      c.globalCompositeOperation = "source-over";
    };
  },

  synth() {
    return (c, w, h, t) => {
      const hz = h * 0.58;
      const sky = c.createLinearGradient(0, 0, 0, hz);
      sky.addColorStop(0, "#12002b"); sky.addColorStop(1, "#ff2d95");
      c.fillStyle = sky; c.fillRect(0, 0, w, hz);
      const sr = h * 0.26, sx = w / 2, sy = hz - sr * 0.35;
      const sg = c.createLinearGradient(0, sy - sr, 0, sy + sr);
      sg.addColorStop(0, "#ffe66d"); sg.addColorStop(1, "#ff3d7f");
      c.fillStyle = sg; c.beginPath(); c.arc(sx, sy, sr, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#c21f78";
      for (let i = 0; i < 6; i++) {
        const y = sy + sr * (0.05 + i * 0.16) - ((t * 8) % (sr * 0.16));
        c.fillRect(sx - sr, y, sr * 2, sr * 0.04 + i * sr * 0.012);
      }
      c.fillStyle = "#0a0014"; c.fillRect(0, hz, w, h - hz);
      c.strokeStyle = "#ff2d95"; c.lineWidth = Math.max(1, w / 400);
      for (let i = -12; i <= 12; i++) {
        c.beginPath(); c.moveTo(w / 2 + i * w * 0.02, hz); c.lineTo(w / 2 + i * w * 0.18, h); c.stroke();
      }
      for (let i = 0; i < 10; i++) {
        const p = ((i + t * 0.8) % 10) / 10;
        const y = hz + (h - hz) * p * p;
        c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke();
      }
    };
  },
};

/* ---------- Card setup & render loop ---------- */
const MAX_PIXEL = 16;              // how chunky when idle
const IDLE_SPEED = 0.15;           // animation speed when not hovered
const LEVELS = [10, 6, 4, 2, 1];   // pixel sizes of each ripple ring, outer -> inner
const RIPPLE_TIME = 0.9;           // seconds for the ripple to cover the whole card
const BAND = 0.16;                 // ring thickness (fraction of card diagonal)
const container = document.getElementById("projects");
const cards = [];

projects.forEach((p) => {
  const el = document.createElement(p.href ? "a" : "article");
  el.className = "card";
  if (p.href) {
    el.href = p.href;
    el.target = "_blank";
    el.rel = "noopener noreferrer";
  }
  el.innerHTML = `
    ${p.video
      ? `<video src="${p.video}" ${reduceMotion ? "" : "autoplay"} loop muted playsinline preload="auto" aria-hidden="true"></video>`
      : "<canvas></canvas>"}
    <div class="info"><h2>${p.name}</h2></div>`;
  container.appendChild(el);

  const canvas = el.querySelector("canvas");
  if (!canvas) return;
  const card = {
    el, canvas, ctx: canvas.getContext("2d"),
    draw: scenes[p.scene](),
    hover: false, r: 0, ox: 0.5, oy: 0.5,
    speed: IDLE_SPEED, t: Math.random() * 100,
    offs: {},
  };
  const setOrigin = (e) => {
    const rect = el.getBoundingClientRect();
    card.ox = (e.clientX - rect.left) / rect.width;
    card.oy = (e.clientY - rect.top) / rect.height;
  };
  el.addEventListener("pointerenter", (e) => {
    if (e.pointerType !== "mouse") return;
    if (card.r < 0.05) setOrigin(e);   // new ripple starts where the cursor lands
    card.hover = true;
  });
  el.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") card.hover = false; });
  // touch: tap to toggle, ripple starts at the tap point
  el.addEventListener("click", (e) => {
    if (matchMedia("(hover: none)").matches) {
      cards.forEach((c) => { if (c !== card) { c.hover = false; c.el.classList.remove("active"); } });
      if (!card.hover && card.r < 0.05) setOrigin(e);
      card.hover = !card.hover;
      el.classList.toggle("active", card.hover);
    }
  });
  cards.push(card);
});

function resizeCards() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  for (const c of cards) {
    const r = c.el.getBoundingClientRect();
    c.canvas.width = Math.round(r.width * dpr);
    c.canvas.height = Math.round(r.height * dpr);
    c.dpr = dpr;
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  for (const c of cards) {
    c.speed += ((c.hover ? 1 : IDLE_SPEED) - c.speed) * Math.min(1, dt * 4);
    c.t += dt * c.speed;
    c.r = Math.min(1, Math.max(0, c.r + (c.hover ? 1 : -1.4) * dt / RIPPLE_TIME));

    const W = c.canvas.width, H = c.canvas.height, ctx = c.ctx;
    ctx.imageSmoothingEnabled = false;

    // render the scene at a given pixel size and stretch it over the card
    const layer = (px) => {
      let o = c.offs[px];
      if (!o) { const cv = document.createElement("canvas"); o = c.offs[px] = { cv, ctx: cv.getContext("2d") }; }
      const scale = Math.max(1, px * c.dpr);
      const lw = Math.max(2, Math.ceil(W / scale)), lh = Math.max(2, Math.ceil(H / scale));
      if (o.cv.width !== lw || o.cv.height !== lh) { o.cv.width = lw; o.cv.height = lh; }
      c.draw(o.ctx, lw, lh, c.t);
      ctx.drawImage(o.cv, 0, 0, lw, lh, 0, 0, W, H);
    };

    const ox = c.ox * W, oy = c.oy * H;
    const maxD = Math.max(Math.hypot(ox, oy), Math.hypot(W - ox, oy), Math.hypot(ox, H - oy), Math.hypot(W - ox, H - oy));
    const band = BAND * Math.hypot(W, H);
    const total = maxD + band * (LEVELS.length - 1);
    const e = c.r < 0.5 ? 2 * c.r * c.r : 1 - Math.pow(-2 * c.r + 2, 2) / 2; // easeInOut
    const front = e * total;

    if (c.r <= 0) { layer(MAX_PIXEL); continue; }
    if (front - band * (LEVELS.length - 1) >= maxD) { layer(1); continue; }

    // base: fully pixelated, then sharper rings clipped inside each other
    layer(MAX_PIXEL);
    LEVELS.forEach((px, i) => {
      const rad = front - i * band;
      if (rad <= 0) return;
      // clip to whole pixel blocks (not a smooth circle) so the edge stays blocky
      const cell = MAX_PIXEL * c.dpr;
      ctx.save();
      ctx.beginPath();
      for (let y = 0; y < H; y += cell) {
        for (let x = 0; x < W; x += cell) {
          if (Math.hypot(x + cell / 2 - ox, y + cell / 2 - oy) < rad) ctx.rect(x, y, cell, cell);
        }
      }
      ctx.clip();
      layer(px);
      ctx.restore();
    });
  }
  requestAnimationFrame(frame);
}

/* ---------- Boot ---------- */
window.addEventListener("resize", () => { sizeTitle(); drawTitle(); resizeCards(); });

// wait for the font so the title is measured and drawn in Space Grotesk (but never hang on it)
const fontReady = document.fonts.load(titleFont(100)).catch(() => {});
Promise.race([fontReady, new Promise((r) => setTimeout(r, 1500))]).then(() => {
  sizeTitle();
  resizeCards();
  requestAnimationFrame(frame);
  playTitle(() => {
    container.querySelectorAll(".card").forEach((el, i) => setTimeout(() => el.classList.add("shown"), reduceMotion ? 0 : i * 140));
  });
});
