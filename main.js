const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
let reduceMotion = motionPreference.matches;

/* ---------- Headings: resolve from chunky pixels to sharp ---------- */
const TITLE_STEPS = [56, 40, 28, 20, 14, 10, 7, 5, 3, 2, 1]; // pixel sizes, coarse -> sharp
const TITLE_STEP_MS = 95;
const headings = [
  { id: "title", parts: [["retrac", "#f3f0ff"], [".space", "#8b86a3"]] },
  { id: "projects-title", parts: [["Featured Projects", "#f3f0ff"]] },
].map(({ id, parts }) => {
  const canvas = document.getElementById(id);
  const off = document.createElement("canvas");
  return { canvas, ctx: canvas.getContext("2d"), off, offCtx: off.getContext("2d"), parts };
});
let titlePx = reduceMotion ? 1 : TITLE_STEPS[0];
let titleAlpha = reduceMotion ? 1 : 0;

function titleFont(size, weight = 700) {
  return `${weight} ${size}px "Space Grotesk", system-ui, sans-serif`;
}

function sizeHeading(heading) {
  const { canvas: titleCanvas, ctx: titleCtx, parts } = heading;
  const css = getComputedStyle(titleCanvas.parentElement);
  const fs = parseFloat(css.fontSize);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  heading.weight = css.fontWeight;
  heading.spacing = (parseFloat(css.letterSpacing) || 0) / fs;
  titleCtx.font = titleFont(fs, heading.weight);
  if ("letterSpacing" in titleCtx) titleCtx.letterSpacing = `${heading.spacing * fs}px`;
  const w = Math.ceil(titleCtx.measureText(parts.map(([text]) => text).join("")).width + fs * 0.1);
  const h = Math.ceil(fs * 1.3);
  titleCanvas.style.width = w + "px";
  titleCanvas.style.height = h + "px";
  titleCanvas.width = Math.round(w * dpr);
  titleCanvas.height = Math.round(h * dpr);
  titleCanvas.fs = fs * dpr;
}

function drawHeading(heading) {
  const { canvas: titleCanvas, ctx: titleCtx, off: titleOff, offCtx: titleOffCtx, parts } = heading;
  const W = titleCanvas.width, H = titleCanvas.height;
  const px = Math.max(1, titlePx * (titleCanvas.width / parseFloat(titleCanvas.style.width)));
  const lw = Math.max(1, Math.ceil(W / px)), lh = Math.max(1, Math.ceil(H / px));
  if (titleOff.width !== lw || titleOff.height !== lh) { titleOff.width = lw; titleOff.height = lh; }

  // render the text small, then stretch it up with smoothing off
  const s = lw / W, fs = titleCanvas.fs * s;
  const c = titleOffCtx;
  c.clearRect(0, 0, lw, lh);
  c.font = titleFont(fs, heading.weight);
  if ("letterSpacing" in c) c.letterSpacing = `${heading.spacing * fs}px`;
  c.textBaseline = "middle";
  let x = fs * 0.05;
  const y = lh / 2;
  for (const [text, color] of parts) {
    c.fillStyle = color;
    c.fillText(text, x, y);
    x += c.measureText(text).width;
  }

  titleCtx.clearRect(0, 0, W, H);
  titleCtx.imageSmoothingEnabled = false;
  titleCtx.globalAlpha = titleAlpha;
  titleCtx.drawImage(titleOff, 0, 0, lw, lh, 0, 0, W, H);
  titleCtx.globalAlpha = 1;
}

function sizeTitle() { headings.forEach(sizeHeading); sizeTitleLetters(); }
function drawTitle() { headings.forEach(drawHeading); }

function playTitle(done) {
  if (reduceMotion) { drawTitle(); done(); return; }
  const start = performance.now();
  const total = TITLE_STEPS.length * TITLE_STEP_MS;
  const tick = (now) => {
    if (reduceMotion) { titlePx = 1; titleAlpha = 1; drawTitle(); done(); return; }
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

/* ---------- Title hover: a small, cursor-following pixel wave ---------- */
const heroHeading = headings[0];
const titleWave = {
  active: false, strength: 0, x: 0.5, y: 0.5, ready: false,
  canvas: document.createElement("canvas"),
};
titleWave.ctx = titleWave.canvas.getContext("2d");

function trackTitlePointer(event) {
  if (reduceMotion || event.pointerType === "touch") return;
  const rect = heroHeading.canvas.getBoundingClientRect();
  titleWave.x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  titleWave.y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
  titleWave.active = true;
}
heroHeading.canvas.addEventListener("pointerenter", trackTitlePointer);
heroHeading.canvas.addEventListener("pointermove", trackTitlePointer);
for (const event of ["pointerleave", "pointercancel"]) {
  heroHeading.canvas.addEventListener(event, () => { titleWave.active = false; });
}
window.addEventListener("blur", () => { titleWave.active = false; });

function drawTitleWave(now, dt) {
  if (reduceMotion || !titleWave.ready || titleFall.active) return;
  const target = titleWave.active ? 1 : 0;
  if (!target && titleWave.strength === 0) return;
  titleWave.strength += (target - titleWave.strength) * (1 - Math.exp(-dt * 14));
  if (!target && titleWave.strength < 0.005) titleWave.strength = 0;

  // Restore a pristine heading every frame so moving the cursor leaves no trail.
  drawHeading(heroHeading);
  if (!titleWave.strength) return;
  const { canvas, ctx, off } = heroHeading;
  const W = canvas.width, H = canvas.height, fs = canvas.fs;
  const dpr = W / parseFloat(canvas.style.width);
  const cell = Math.max(2, Math.round(3 * dpr));
  const pixel = titleWave.canvas;
  const lw = Math.ceil(W / cell), lh = Math.ceil(H / cell);
  if (pixel.width !== lw || pixel.height !== lh) { pixel.width = lw; pixel.height = lh; }
  titleWave.ctx.clearRect(0, 0, lw, lh);
  titleWave.ctx.drawImage(off, 0, 0, off.width, off.height, 0, 0, lw, lh);

  const center = titleWave.x * W;
  const radius = fs * 0.72; // about two to three letters, independent of screen size
  const strip = W / lw;
  const start = Math.max(0, Math.floor((center - radius) / strip));
  const end = Math.min(lw, Math.ceil((center + radius) / strip));
  // A stepped clock and whole-pixel offsets give this a digital, wavy cadence.
  const time = Math.floor(now / 55) * 0.055;
  for (let i = start; i < end; i++) {
    const x = i * strip;
    const distance = Math.min(1, Math.abs(x + strip / 2 - center) / radius);
    const envelope = (1 - distance * distance) ** 2;
    const mix = envelope * titleWave.strength;
    const wave = Math.sin((x - center) / fs * 12 - time * 8 + titleWave.y * 3);
    const offset = Math.round(wave * fs * 0.055 * mix / cell) * cell;
    ctx.clearRect(x, 0, strip, H);
    ctx.globalAlpha = 1 - mix;
    ctx.drawImage(off, x * off.width / W, 0, strip * off.width / W, off.height, x, 0, strip, H);
    ctx.globalAlpha = mix;
    ctx.drawImage(pixel, i, 0, 1, lh, x, offset, strip, H);
  }
  ctx.globalAlpha = 1;
}

/* ---------- Title easter egg: a viewport-pinned, tumbling chain reaction ---------- */
const letterTargets = document.getElementById("title-letters");
const fallingCanvas = document.getElementById("falling-title");
const fallingCtx = fallingCanvas.getContext("2d");
const motionNotice = document.getElementById("motion-notice");
const titleFall = { active: false, letters: [], start: 0, noticeTimer: null };
const FALL_THROUGH_AT = 2500;
const DISAPPEAR_AT = 2800;
const RETURN_AT = DISAPPEAR_AT + 500;
const POP_MS = 180;

// Use the same advances and part boundaries as the original canvas rendering.
function titleLetterLayout() {
  const { canvas, ctx, parts, weight, spacing } = heroHeading;
  ctx.font = titleFont(canvas.fs, weight);
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${spacing * canvas.fs}px`;
  const scale = parseFloat(canvas.style.width) / canvas.width;
  let x = canvas.fs * 0.05;
  const letters = [];
  for (const [text] of parts) {
    for (let i = 0; i < text.length; i++) {
      const left = x + ctx.measureText(text.slice(0, i)).width;
      const right = x + ctx.measureText(text.slice(0, i + 1)).width;
      letters.push({ char: text[i], left: left * scale, width: (right - left) * scale });
    }
    x += ctx.measureText(text).width;
  }
  return letters;
}

function sizeTitleLetters() {
  const layout = titleLetterLayout();
  if (!letterTargets.children.length) {
    layout.forEach((letter, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "title-letter";
      button.setAttribute("aria-label", `Animate title: ${letter.char}`);
      button.addEventListener("click", () => startTitleFall(index));
      letterTargets.appendChild(button);
    });
    // The transparent hit targets sit above the canvas, so forward its hover effect.
    for (const event of ["pointerenter", "pointermove"]) letterTargets.addEventListener(event, trackTitlePointer);
    for (const event of ["pointerleave", "pointercancel"]) {
      letterTargets.addEventListener(event, () => { titleWave.active = false; });
    }
  }
  layout.forEach((letter, i) => {
    letterTargets.children[i].style.left = `${letter.left}px`;
    letterTargets.children[i].style.width = `${letter.width}px`;
  });
}

function finishTitleFall() {
  titleFall.active = false;
  titleFall.letters = [];
  fallingCanvas.hidden = true;
  titleWave.active = false;
  titleWave.strength = 0;
  drawHeading(heroHeading);
}

function startTitleFall(origin) {
  // Check the current preference on every attempt, including keyboard activation.
  if (motionPreference.matches) {
    motionNotice.hidden = false;
    clearTimeout(titleFall.noticeTimer);
    titleFall.noticeTimer = setTimeout(() => { motionNotice.hidden = true; }, 5000);
    return;
  }
  if (titleFall.active || !titleWave.ready) return;
  titleWave.strength = 0;
  drawHeading(heroHeading);
  const rect = heroHeading.canvas.getBoundingClientRect();
  const dpr = heroHeading.canvas.width / parseFloat(heroHeading.canvas.style.width);
  titleFall.letters = titleLetterLayout().map((letter, index) => {
    const sprite = document.createElement("canvas");
    // Include the leading inset in the first slice; adjacent slices preserve kerning.
    const left = index === 0 ? 0 : letter.left;
    const width = letter.width + letter.left - left;
    const metrics = heroHeading.offCtx.measureText(letter.char);
    const top = Math.max(0, Math.floor(heroHeading.canvas.height / 2 - (metrics.actualBoundingBoxAscent ?? heroHeading.canvas.height / 2)) - 1);
    const bottom = Math.min(heroHeading.canvas.height, Math.ceil(heroHeading.canvas.height / 2 + (metrics.actualBoundingBoxDescent ?? heroHeading.canvas.height / 2)) + 1);
    const height = bottom - top;
    sprite.width = Math.ceil(width * dpr);
    sprite.height = height;
    sprite.getContext("2d").drawImage(heroHeading.canvas, left * dpr, top,
      width * dpr, sprite.height, 0, 0, sprite.width, sprite.height);
    return {
      sprite, left, width, height: height / dpr,
      x: rect.left + left + width / 2, y: rect.top + (top + height / 2) / dpr,
      vx: (Math.random() - 0.5) * 420, vy: -100 - Math.random() * 160,
      angle: 0, spin: (Math.random() - 0.5) * 9,
      delay: Math.abs(index - origin) * 48,
      restitution: 0.25 + Math.random() * 0.2,
    };
  });
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  fallingCanvas.width = Math.round(window.innerWidth * scale);
  fallingCanvas.height = Math.round(window.innerHeight * scale);
  fallingCanvas.style.width = `${window.innerWidth}px`;
  fallingCanvas.style.height = `${window.innerHeight}px`;
  fallingCtx.setTransform(scale, 0, 0, scale, 0, 0);
  titleFall.active = true;
  titleFall.start = performance.now();
  fallingCanvas.hidden = false;
}

function drawTitleFall(now, dt) {
  if (!titleFall.active) return;
  const elapsed = now - titleFall.start;
  if (elapsed >= RETURN_AT + POP_MS) { finishTitleFall(); return; }
  const W = window.innerWidth, H = window.innerHeight;
  fallingCtx.clearRect(0, 0, W, H);
  drawHeading(heroHeading);
  const { ctx, canvas } = heroHeading;
  const dpr = canvas.width / parseFloat(canvas.style.width);
  if (elapsed >= RETURN_AT) {
    // A quick pop at the current title position, even if the user has scrolled.
    const p = Math.min(1, (elapsed - RETURN_AT) / POP_MS);
    const scale = 1 + Math.sin(p * Math.PI) * 0.12;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(scale, scale);
    ctx.globalAlpha = p;
    ctx.drawImage(heroHeading.off, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
    ctx.restore();
    return;
  }
  for (const letter of titleFall.letters) {
    if (elapsed < letter.delay) continue;
    ctx.clearRect(letter.left * dpr, 0, letter.width * dpr, canvas.height);
    if (elapsed >= DISAPPEAR_AT) continue;
    // Semi-implicit gravity, wall impacts and a damped, rotating floor bounce.
    letter.vy += 2400 * dt;
    letter.x += letter.vx * dt;
    letter.y += letter.vy * dt;
    letter.angle += letter.spin * dt;
    const rx = Math.abs(Math.cos(letter.angle)) * letter.width / 2 + Math.abs(Math.sin(letter.angle)) * letter.height / 2;
    const ry = Math.abs(Math.sin(letter.angle)) * letter.width / 2 + Math.abs(Math.cos(letter.angle)) * letter.height / 2;
    if (letter.x < rx || letter.x > W - rx) {
      letter.x = Math.max(rx, Math.min(W - rx, letter.x));
      letter.vx *= -0.6;
      letter.spin *= -0.7;
    }
    if (elapsed < FALL_THROUGH_AT && letter.y + ry > H) {
      letter.y = H - ry;
      letter.vy = -Math.abs(letter.vy) * letter.restitution;
      letter.vx *= 0.8;
      letter.spin *= 0.65;
    }
    fallingCtx.save();
    fallingCtx.translate(letter.x, letter.y);
    fallingCtx.rotate(letter.angle);
    fallingCtx.drawImage(letter.sprite, -letter.width / 2, -letter.height / 2, letter.width, letter.height);
    fallingCtx.restore();
  }
}

motionPreference.addEventListener("change", () => {
  reduceMotion = motionPreference.matches;
  if (reduceMotion) {
    if (titleFall.active) finishTitleFall();
    titleWave.active = false;
    titleWave.strength = 0;
    titlePx = 1;
    titleAlpha = 1;
    drawTitle();
  }
});

/* ---------- Projects ---------- */
const projects = [
  {
    name: "Retrac Labs",
    video: "assets/retrac-labs-loop.mp4",
    href: "https://retraclabs.io/?utm_source=retrac.space&utm_medium=referral&utm_campaign=personal_site",
  },
  {
    name: "Retrac's Rickroll",
    video: "assets/retrac-rickroll-loop.mp4",
    href: "https://surprise.retrac.space/",
  },
  {
    name: "Membrain",
    video: "assets/membrain-loop.mp4#t=3",
    href: "https://github.com/retracdev/membrain",
  },
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

function videoScene(video) {
  return (c, w, h) => {
    c.fillStyle = "#0b0620";
    c.fillRect(0, 0, w, h);
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;

    // Center-crop like object-fit: cover before the shared pixel/ripple pass.
    const scale = Math.max(w / video.videoWidth, h / video.videoHeight);
    const sw = w / scale, sh = h / scale;
    c.drawImage(video, (video.videoWidth - sw) / 2, (video.videoHeight - sh) / 2, sw, sh, 0, 0, w, h);
  };
}

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
    <canvas aria-hidden="true"></canvas>
    ${p.video
      ? `<video hidden src="${p.video}" ${reduceMotion ? "" : "autoplay"} loop muted playsinline preload="auto" aria-hidden="true"></video>`
      : ""}
    <div class="info"><h2>${p.name}</h2></div>`;
  container.appendChild(el);

  const canvas = el.querySelector("canvas");
  const video = el.querySelector("video");
  if (video) video.playbackRate = IDLE_SPEED;
  // Explicit playback also supports muted video sources hidden behind a canvas.
  if (video && !reduceMotion) video.play().catch(() => {});
  const card = {
    el, canvas, video, ctx: canvas.getContext("2d"),
    draw: video ? videoScene(video) : scenes[p.scene](),
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
  drawTitleWave(now, dt);
  drawTitleFall(now, dt);
  for (const c of cards) {
    c.speed += ((c.hover ? 1 : IDLE_SPEED) - c.speed) * Math.min(1, dt * 4);
    if (c.video) c.video.playbackRate = c.speed;
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
window.addEventListener("resize", () => {
  if (titleFall.active) finishTitleFall();
  sizeTitle(); drawTitle(); resizeCards();
});

// Wait for both font weights before measuring the headings (but never hang on them).
const fontReady = Promise.all([700, 600].map((weight) => document.fonts.load(titleFont(100, weight)))).catch(() => {});
Promise.race([fontReady, new Promise((r) => setTimeout(r, 1500))]).then(() => {
  sizeTitle();
  resizeCards();
  requestAnimationFrame(frame);
  playTitle(() => {
    titleWave.ready = true;
    container.querySelectorAll(".card").forEach((el, i) => setTimeout(() => el.classList.add("shown"), reduceMotion ? 0 : i * 140));
  });
});
