// retrac.space as a solar system: I'm the sun, each project is a planet.
// Click a planet to fly to it; click it again (or the panel link) to visit.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const orbits = window.SpaceOrbits;
const motion = motionSettings;
const root = document.documentElement;
const canvas = document.getElementById('space');
const notice = document.getElementById('motion-notice');

let ready = false;
let scheduled = false;
let last = 0;

/* ---------- Notice ---------- */
let noticeTimer;
function announce() {
  notice.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice.hidden = true; }, 5000);
}

/* ---------- Logo: V1's pixel title, centred at the top ---------- */
// Pure 2D canvas, so it works even if WebGL does not. It resolves from chunky
// pixels on load, ripples in a pixel wave under the cursor, and its letters
// are transparent buttons that start the drop Easter egg.
const LOGO_STEPS = [56, 40, 28, 20, 14, 10, 7, 5, 3, 2, 1]; // pixel sizes, coarse -> sharp
const LOGO_STEP_MS = 95;
const TITLE = 'retrac.space';
const titleEl = document.querySelector('.title');
const logoCanvas = document.getElementById('logo');
const logoCtx = logoCanvas.getContext('2d');
const logoOff = document.createElement('canvas');
const logoOffCtx = logoOff.getContext('2d');
const waveCanvas = document.createElement('canvas');
const waveCtx = waveCanvas.getContext('2d');
const lettersEl = document.getElementById('title-letters');
const logo = { fs: 0, dpr: 1, weight: '700', spacing: 0, px: LOGO_STEPS[0], alpha: 0, ready: false };
const wave = { active: false, strength: 0, x: 0.5, y: 0.5, running: false, last: 0 };
titleEl.classList.add('logo-on');

const logoFont = size => `${logo.weight} ${size}px "Space Grotesk", system-ui, sans-serif`;
function logoParts() {
  const css = getComputedStyle(root);
  return [
    ['retrac', css.getPropertyValue('--fg').trim() || '#ecebf2'],
    ['.space', css.getPropertyValue('--muted').trim() || '#8d8b99'],
  ];
}

const titleButtons = Array.from(TITLE, (char, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `title-letter${index >= 6 ? ' dim' : ''}`;
  button.textContent = char;
  button.setAttribute('aria-label', `Animate title: ${char}`);
  button.addEventListener('click', () => startDrop(index));
  return button;
});
lettersEl.replaceChildren(...titleButtons);
lettersEl.removeAttribute('aria-hidden');

function sizeLogo() {
  const css = getComputedStyle(titleEl);
  const fs = parseFloat(css.fontSize);
  logo.dpr = Math.min(window.devicePixelRatio || 1, 2);
  logo.weight = css.fontWeight;
  logo.spacing = (parseFloat(css.letterSpacing) || 0) / fs;
  logoCtx.font = logoFont(fs);
  if ('letterSpacing' in logoCtx) logoCtx.letterSpacing = `${logo.spacing * fs}px`;
  const width = Math.ceil(logoCtx.measureText(TITLE).width + fs * 0.1);
  const height = Math.ceil(fs * 1.3);
  logoCanvas.style.width = `${width}px`;
  logoCanvas.style.height = `${height}px`;

  // Line the letter buttons up with the glyphs, using the same advances as the drawing.
  let x = fs * 0.05, index = 0;
  for (const [text] of logoParts()) {
    for (let i = 0; i < text.length; i++, index++) {
      const left = x + logoCtx.measureText(text.slice(0, i)).width;
      const right = x + logoCtx.measureText(text.slice(0, i + 1)).width;
      titleButtons[index].style.left = `${left}px`;
      titleButtons[index].style.width = `${right - left}px`;
    }
    x += logoCtx.measureText(text).width;
  }

  // Resizing the backing store resets the context, so do it last.
  logoCanvas.width = Math.round(width * logo.dpr);
  logoCanvas.height = Math.round(height * logo.dpr);
  logo.fs = fs * logo.dpr;
}

// Render the text small, then stretch it up with smoothing off.
function drawLogo() {
  if (!logo.fs) return;
  const W = logoCanvas.width, H = logoCanvas.height;
  const px = Math.max(1, logo.px * logo.dpr);
  const lw = Math.max(1, Math.ceil(W / px)), lh = Math.max(1, Math.ceil(H / px));
  if (logoOff.width !== lw || logoOff.height !== lh) { logoOff.width = lw; logoOff.height = lh; }
  const fs = logo.fs * (lw / W);
  const c = logoOffCtx;
  c.clearRect(0, 0, lw, lh);
  c.font = logoFont(fs);
  if ('letterSpacing' in c) c.letterSpacing = `${logo.spacing * fs}px`;
  c.textBaseline = 'middle';
  let x = fs * 0.05;
  for (const [text, color] of logoParts()) {
    c.fillStyle = color;
    c.fillText(text, x, lh / 2);
    x += c.measureText(text).width;
  }
  logoCtx.clearRect(0, 0, W, H);
  logoCtx.imageSmoothingEnabled = false;
  logoCtx.globalAlpha = logo.alpha;
  logoCtx.drawImage(logoOff, 0, 0, lw, lh, 0, 0, W, H);
  logoCtx.globalAlpha = 1;
}

function showLogo() {
  logo.px = 1;
  logo.alpha = 1;
  logo.ready = true;
  drawLogo();
}

// Resolve from chunky pixels to sharp, like V1's intro.
function playLogo() {
  if (motion.matches) { showLogo(); return; }
  const begin = performance.now();
  const total = LOGO_STEPS.length * LOGO_STEP_MS;
  const tick = now => {
    if (motion.matches) { showLogo(); return; }
    // rAF's timestamp can land slightly before `begin`, so clamp at 0.
    const p = orbits.clamp((now - begin) / total);
    logo.px = LOGO_STEPS[Math.min(LOGO_STEPS.length - 1, Math.floor(p * LOGO_STEPS.length))];
    logo.alpha = Math.min(1, p * 3);
    drawLogo();
    if (p < 1) requestAnimationFrame(tick);
    else logo.ready = true;
  };
  requestAnimationFrame(tick);
}

/* Hover: a small, cursor-following pixel wave, as on V1. */
function trackLogoPointer(event) {
  if (motion.matches || event.pointerType === 'touch') return;
  const rect = logoCanvas.getBoundingClientRect();
  wave.x = orbits.clamp((event.clientX - rect.left) / rect.width);
  wave.y = orbits.clamp((event.clientY - rect.top) / rect.height);
  wave.active = true;
  if (!wave.running) {
    wave.running = true;
    wave.last = performance.now();
    requestAnimationFrame(waveFrame);
  }
}
for (const type of ['pointerenter', 'pointermove']) lettersEl.addEventListener(type, trackLogoPointer);
for (const type of ['pointerleave', 'pointercancel']) lettersEl.addEventListener(type, () => { wave.active = false; });
window.addEventListener('blur', () => { wave.active = false; });

function stopWave() {
  wave.active = false;
  wave.strength = 0;
  if (!drop) drawLogo();
}

function waveFrame(now) {
  const dt = Math.min(0.05, Math.max(0, now - wave.last) / 1000);
  wave.last = now;
  if (motion.matches || drop || !logo.ready) { wave.running = false; stopWave(); return; }
  wave.strength += ((wave.active ? 1 : 0) - wave.strength) * (1 - Math.exp(-dt * 14));
  if (!wave.active && wave.strength < 0.005) wave.strength = 0;

  // Restore a pristine logo every frame so moving the cursor leaves no trail.
  drawLogo();
  if (!wave.strength) { wave.running = false; return; }
  const W = logoCanvas.width, H = logoCanvas.height, fs = logo.fs;
  // V1 ran this on a 168px title. This logo is about a third of that, so it
  // uses finer pixels and a taller swing to read the same way.
  const cell = Math.max(2, Math.round(2 * logo.dpr));
  const lw = Math.ceil(W / cell), lh = Math.ceil(H / cell);
  if (waveCanvas.width !== lw || waveCanvas.height !== lh) { waveCanvas.width = lw; waveCanvas.height = lh; }
  waveCtx.clearRect(0, 0, lw, lh);
  waveCtx.drawImage(logoOff, 0, 0, logoOff.width, logoOff.height, 0, 0, lw, lh);

  const center = wave.x * W;
  const radius = fs * 1.1; // about three to four letters
  const strip = W / lw;
  const first = Math.max(0, Math.floor((center - radius) / strip));
  const last = Math.min(lw, Math.ceil((center + radius) / strip));
  // A stepped clock and whole-pixel offsets give it a digital, wavy cadence.
  const time = Math.floor(now / 55) * 0.055;
  for (let i = first; i < last; i++) {
    const x = i * strip;
    const distance = Math.min(1, Math.abs(x + strip / 2 - center) / radius);
    const mix = (1 - distance * distance) ** 2 * wave.strength;
    const swing = Math.sin((x - center) / fs * 12 - time * 8 + wave.y * 3);
    const offset = Math.round(swing * fs * 0.15 * mix / cell) * cell;
    logoCtx.clearRect(x, 0, strip, H);
    logoCtx.globalAlpha = 1 - mix;
    logoCtx.drawImage(logoOff, x * logoOff.width / W, 0, strip * logoOff.width / W, logoOff.height, x, 0, strip, H);
    logoCtx.globalAlpha = mix;
    logoCtx.drawImage(waveCanvas, i, 0, 1, lh, x, offset, strip, H);
  }
  logoCtx.globalAlpha = 1;
  requestAnimationFrame(waveFrame);
}

/* Easter egg: the letters drop, bounce, and pop back. While they fall, the
   canvas hides and the letter buttons show their own glyphs. */
let drop = null;
function startDrop(origin) {
  // Check the live preference on every attempt, including keyboard activation.
  if (motion.matches) { announce(); return; }
  if (drop || !logo.ready) return;
  const now = performance.now();
  wave.active = false;
  wave.strength = 0;
  titleEl.classList.add('dropping');
  drop = {
    start: now, last: now,
    rects: titleButtons.map(button => button.getBoundingClientRect()),
    bodies: orbits.createDrop(titleButtons.length, origin),
  };
  requestAnimationFrame(dropFrame);
}
function dropFrame(now) {
  if (!drop) return;
  const dt = Math.min(0.05, Math.max(0, now - drop.last) / 1000);
  drop.last = now;
  const elapsed = now - drop.start;
  const { DROP } = orbits;
  if (elapsed >= DROP.returnAt) {
    const p = Math.min(1, (elapsed - DROP.returnAt) / DROP.popMs);
    const scale = 0.6 + 0.4 * p + Math.sin(p * Math.PI) * 0.12;
    for (const button of titleButtons) {
      button.style.transform = `scale(${scale})`;
      button.style.opacity = String(p);
    }
    if (p >= 1) { endDrop(); return; }
  } else {
    drop.bodies.forEach((body, i) => {
      const rect = drop.rects[i];
      orbits.stepDrop(body, dt, elapsed, { floor: window.innerHeight - rect.bottom, left: -rect.left, right: window.innerWidth - rect.right });
      titleButtons[i].style.transform = `translate(${body.x}px, ${body.y}px) rotate(${body.angle}rad)`;
      titleButtons[i].style.opacity = elapsed >= DROP.disappearAt ? '0' : '';
    });
  }
  requestAnimationFrame(dropFrame);
}
function endDrop() {
  drop = null;
  titleEl.classList.remove('dropping');
  for (const button of titleButtons) {
    button.style.transform = '';
    button.style.opacity = '';
  }
  drawLogo();
}

// Wait for the bold weight before measuring (but never hang on it).
const fontReady = document.fonts ? document.fonts.load(logoFont(100)).catch(() => {}) : Promise.resolve();
Promise.race([fontReady, new Promise(resolve => setTimeout(resolve, 1500))]).then(() => {
  sizeLogo();
  playLogo();
});
window.addEventListener('resize', () => {
  if (drop) endDrop();
  sizeLogo();
  drawLogo();
});

/* ---------- Renderer ---------- */
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch {
  renderer = null; // The plain page stays.
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 3000);
const BASE_FOV = 50;

/* ---------- Procedural textures ---------- */
function hash(x, y, z, seed) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const smooth = t => t * t * (3 - 2 * t);
function noise3(x, y, z, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = smooth(x - xi), v = smooth(y - yi), w = smooth(z - zi);
  const corner = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz, seed);
  const lerp = (a, b, t) => a + (b - a) * t;
  return lerp(
    lerp(lerp(corner(0, 0, 0), corner(1, 0, 0), u), lerp(corner(0, 1, 0), corner(1, 1, 0), u), v),
    lerp(lerp(corner(0, 0, 1), corner(1, 0, 1), u), lerp(corner(0, 1, 1), corner(1, 1, 1), u), v),
    w,
  );
}
function fbm(x, y, z, seed, octaves = 4) {
  let sum = 0, amplitude = 0.5, total = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise3(x, y, z, seed + i * 17) * amplitude;
    total += amplitude;
    x *= 2.03; y *= 2.03; z *= 2.03;
    amplitude *= 0.5;
  }
  return sum / total;
}
function hexBytes(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

// Equirectangular surface. Sampling noise on the sphere keeps the seam invisible.
function surfaceTexture({ colors, bands = 0, warp = 1, seed, scale = 2.4, lights = null, width = 512 }) {
  const height = width / 2;
  const surface = document.createElement('canvas');
  surface.width = width;
  surface.height = height;
  const ctx = surface.getContext('2d');
  const image = ctx.createImageData(width, height);
  const night = lights ? ctx.createImageData(width, height) : null;
  const palette = colors.map(hexBytes);
  for (let y = 0; y < height; y++) {
    const lat = (y / height - 0.5) * Math.PI;
    for (let x = 0; x < width; x++) {
      const lon = (x / width) * Math.PI * 2;
      const px = Math.cos(lat) * Math.cos(lon), py = Math.sin(lat), pz = Math.cos(lat) * Math.sin(lon);
      const n = fbm(px * scale + 10, py * scale + 10, pz * scale + 10, seed);
      let value;
      if (bands) {
        const band = 0.5 + 0.5 * Math.sin(py * bands * 2 + (n - 0.5) * warp * 6);
        value = band * 0.65 + n * 0.35;
      } else {
        value = Math.min(1, Math.max(0, (n - 0.28) / 0.47));
      }
      // Three-stop ramp: shadow -> base -> highlight.
      const t = value * 2;
      const [a, b] = t < 1 ? [palette[0], palette[1]] : [palette[1], palette[2]];
      const f = t < 1 ? t : t - 1;
      const i = (y * width + x) * 4;
      image.data[i] = a[0] + (b[0] - a[0]) * f;
      image.data[i + 1] = a[1] + (b[1] - a[1]) * f;
      image.data[i + 2] = a[2] + (b[2] - a[2]) * f;
      image.data[i + 3] = 255;
      if (night) {
        // Small clusters of light in the lowlands, seen only on the night side.
        const speck = fbm(px * 14, py * 14, pz * 14, seed + 99, 2);
        const glow = value < 0.5 && speck > 0.6 ? Math.min(1, (speck - 0.6) * 6) : 0;
        night.data[i] = night.data[i + 1] = night.data[i + 2] = glow * 255;
        night.data[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(image, 0, 0);
  const map = new THREE.CanvasTexture(surface);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  let emissiveMap = null;
  if (night) {
    const nightCanvas = document.createElement('canvas');
    nightCanvas.width = width;
    nightCanvas.height = height;
    nightCanvas.getContext('2d').putImageData(night, 0, 0);
    emissiveMap = new THREE.CanvasTexture(nightCanvas);
    emissiveMap.colorSpace = THREE.SRGBColorSpace;
  }
  return { map, emissiveMap };
}

function glowTexture() {
  const size = 256;
  const glow = document.createElement('canvas');
  glow.width = glow.height = size;
  const ctx = glow.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(0.18, 'rgba(255,255,255,0.4)');
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.08)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(glow);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function ringTexture(color, seed) {
  const ring = document.createElement('canvas');
  ring.width = 512;
  ring.height = 4;
  const ctx = ring.getContext('2d');
  const [r, g, b] = hexBytes(color);
  for (let x = 0; x < 512; x++) {
    const t = x / 512;
    const lanes = fbm(t * 40, 0.5, 0.5, seed, 3);
    const edge = Math.min(1, t * 8, (1 - t) * 6);
    const alpha = Math.max(0, lanes - 0.32) * 1.6 * edge;
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
    ctx.fillRect(x, 0, 1, 4);
  }
  const texture = new THREE.CanvasTexture(ring);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/* ---------- Scene contents ---------- */
// Muted, natural tones. Radius/orbit are in scene units, periods in seconds.
const PLANETS = {
  soundboard: { colors: ['#232c40', '#56688a', '#a7b3c9'], bands: 6, warp: 2.2, radius: 1.0, orbit: 8.5, period: 80, phase: 0.6, tilt: 0.06, seed: 11, swatch: '#8193b3' },
  glow: { colors: ['#1c2c2b', '#4f6e68', '#b7cfc6'], radius: 0.9, orbit: 12.5, period: 110, phase: 2.5, tilt: -0.05, seed: 23, swatch: '#8fb8ad', lights: '#d8f2e6', atmosphere: '#a8dccd' },
  rickroll: { colors: ['#3a231c', '#8a604c', '#d2b296'], radius: 1.15, orbit: 17, period: 145, phase: 4.3, tilt: 0.08, seed: 37, swatch: '#bd977f', ring: '#bfa38c' },
  labs: { colors: ['#25223a', '#6c6790', '#c9c4dc'], bands: 10, warp: 1.3, radius: 1.75, orbit: 24, period: 200, phase: 1.2, tilt: -0.03, seed: 51, swatch: '#9f99bd', ring: '#a7a1c2', moon: true },
};

const atmosphereVertex = `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const atmosphereFragment = `
  uniform vec3 color;
  uniform float strength;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float rim = pow(1.0 - max(dot(normalize(vNormal), normalize(vView)), 0.0), 3.0) * strength;
    gl_FragColor = vec4(color * rim, rim);
    #include <colorspace_fragment>
  }
`;
function atmosphere(radius, color, strength) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.07, 48, 24),
    new THREE.ShaderMaterial({
      vertexShader: atmosphereVertex, fragmentShader: atmosphereFragment,
      uniforms: { color: { value: new THREE.Color(color) }, strength: { value: strength } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }),
  );
}

function orbitLine(radius, tilt) {
  const points = [];
  for (let i = 0; i <= 256; i++) {
    const p = orbits.orbitPosition({ radius, period: 0, phase: (i / 256) * orbits.TAU, tilt }, 0);
    points.push(new THREE.Vector3(p.x, p.y, p.z));
  }
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, depthWrite: false }),
  );
}

const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
const bodies = [];
let stars;
let sunGlow;
const SUN_RADIUS = 2.6;

function buildScene() {
  scene.add(new THREE.AmbientLight(0xb4b2c8, 0.45));
  scene.add(new THREE.PointLight(0xfff0dc, 3.3, 0, 0)); // no falloff: every planet gets a clear day side

  // Stars: a far shell with a few brighter ones, faintly warm or cool.
  const count = 2600;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
    if (v.lengthSq() < 1e-4) v.set(1, 0, 0);
    v.normalize().multiplyScalar(300 + Math.random() * 500);
    positions.set([v.x, v.y, v.z], i * 3);
    const brightness = 0.25 + Math.random() ** 4 * 0.75;
    const warm = Math.random() - 0.5;
    colors.set([brightness * (1 + warm * 0.12), brightness, brightness * (1 - warm * 0.12)], i * 3);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  starGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false }));
  scene.add(stars);

  // The sun: me. Clicking it opens the bio.
  const sunGroup = new THREE.Group();
  const { map: sunMap } = surfaceTexture({ colors: ['#f2c58e', '#fbe0b8', '#fff4e2'], seed: 3, scale: 6, width: 256 });
  const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(SUN_RADIUS, 64, 32), new THREE.MeshBasicMaterial({ map: sunMap }));
  sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: 0xffdfb4, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  sunGlow.scale.setScalar(SUN_RADIUS * 7);
  const sunHit = new THREE.Mesh(new THREE.SphereGeometry(SUN_RADIUS * 1.1, 16, 8), hitMaterial);
  sunGroup.add(sunMesh, sunGlow, sunHit);
  scene.add(sunGroup);
  const bio = [...document.querySelectorAll('#bio p')].map(p => p.textContent);
  bodies.push({
    key: 'sun', name: 'Carter Welch', kind: 'Bio', bio, swatch: '#f6dcb4',
    group: sunGroup, spinner: sunMesh, hit: sunHit, radius: SUN_RADIUS, orbit: null,
  });

  // Planets come from the plain page's project list.
  for (const item of document.querySelectorAll('[data-planet]')) {
    const style = PLANETS[item.dataset.planet];
    if (!style) continue;
    const link = item.querySelector('a');
    const group = new THREE.Group();
    const tiltGroup = new THREE.Group(); // axial tilt
    tiltGroup.rotation.z = 0.25 + style.seed * 0.01;
    const { map, emissiveMap } = surfaceTexture(style);
    const material = new THREE.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0 });
    if (emissiveMap) {
      material.emissiveMap = emissiveMap;
      material.emissive = new THREE.Color(style.lights);
      material.emissiveIntensity = 0.7;
    }
    const planet = new THREE.Mesh(new THREE.SphereGeometry(style.radius, 64, 32), material);
    tiltGroup.add(planet);
    tiltGroup.add(atmosphere(style.radius, style.atmosphere || style.swatch, style.atmosphere ? 1.1 : 0.45));
    if (style.ring) {
      const inner = style.radius * 1.35, outer = style.radius * 2.25;
      const geometry = new THREE.RingGeometry(inner, outer, 128, 1);
      // Map u across the ring's width so the texture reads as concentric lanes.
      const position = geometry.attributes.position, uv = geometry.attributes.uv;
      for (let i = 0; i < position.count; i++) {
        const distance = Math.hypot(position.getX(i), position.getY(i));
        uv.setXY(i, (distance - inner) / (outer - inner), 0.5);
      }
      const ring = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        map: ringTexture(style.ring, style.seed), transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.75,
      }));
      ring.rotation.x = -Math.PI / 2 + 0.12;
      tiltGroup.add(ring);
    }
    let moon = null;
    if (style.moon) {
      moon = new THREE.Group();
      const moonMesh = new THREE.Mesh(
        new THREE.SphereGeometry(style.radius * 0.18, 32, 16),
        new THREE.MeshStandardMaterial({ map: surfaceTexture({ colors: ['#3b3a40', '#77757e', '#b9b7bf'], seed: 71, scale: 4, width: 256 }).map, roughness: 1 }),
      );
      moonMesh.position.x = style.radius * 3;
      moon.add(moonMesh);
      moon.rotation.z = 0.2;
      group.add(moon);
    }
    const hit = new THREE.Mesh(new THREE.SphereGeometry(Math.max(style.radius * 1.5, 1.2), 16, 8), hitMaterial);
    group.add(tiltGroup, hit);
    scene.add(group);
    const line = orbitLine(style.orbit, style.tilt);
    scene.add(line);
    bodies.push({
      key: item.dataset.planet, name: link.textContent.trim(), href: link.href, kind: item.dataset.kind,
      video: item.dataset.video, swatch: style.swatch,
      group, spinner: planet, hit, moon, line, radius: style.radius,
      orbit: { radius: style.orbit, period: style.period, phase: style.phase, tilt: style.tilt },
    });
  }
  for (const body of bodies) body.hit.userData.body = body;
}

/* ---------- Labels, legend and panel ---------- */
const labelsEl = document.getElementById('labels');
const legend = document.getElementById('legend');
const panel = document.getElementById('panel');
const panelKind = document.getElementById('panel-kind');
const panelTitle = document.getElementById('panel-title');
const panelVideo = document.getElementById('panel-video');
const panelBio = document.getElementById('panel-bio');
const panelLink = document.getElementById('panel-link');
const hint = document.getElementById('hint');

function buildInterface() {
  for (const body of bodies) {
    body.label = document.createElement('span');
    body.label.className = 'label';
    body.label.textContent = body.name;
    labelsEl.append(body.label);
    body.button = document.createElement('button');
    body.button.type = 'button';
    body.button.setAttribute('aria-pressed', 'false');
    body.button.innerHTML = '<span class="swatch" aria-hidden="true"></span>';
    body.button.append(body.name);
    body.button.style.setProperty('--swatch', body.swatch);
    body.button.addEventListener('click', () => (focused === body ? unfocus() : focus(body)));
    legend.append(body.button);
  }
}

function showPanel(body) {
  panelKind.textContent = body.kind;
  panelTitle.textContent = body.name;
  panelBio.replaceChildren(...(body.bio || []).map(text => Object.assign(document.createElement('p'), { textContent: text })));
  if (body.video) {
    if (panelVideo.getAttribute('src') !== body.video) {
      panelVideo.preload = 'auto';
      panelVideo.src = body.video;
    }
    panelVideo.hidden = false;
  } else {
    panelVideo.pause();
    panelVideo.removeAttribute('src');
    panelVideo.load();
    panelVideo.hidden = true;
  }
  panelLink.hidden = !body.href;
  if (body.href) {
    panelLink.href = body.href;
    panelLink.innerHTML = '<span></span><span aria-hidden="true">↗</span>';
    panelLink.firstChild.textContent = `Visit ${body.name}`;
  }
  panel.hidden = false;
  syncVideo();
}

// Previews play only when motion is allowed and the tab is visible.
function syncVideo() {
  if (!panel.hidden && !panelVideo.hidden && !motion.matches && !document.hidden) panelVideo.play().catch(() => {});
  else panelVideo.pause();
}

document.getElementById('panel-close').addEventListener('click', () => {
  const button = focused?.button;
  unfocus();
  button?.focus();
});

/* ---------- Camera: overview, flights and following ---------- */
let controls;
let focused = null;
let flight = null;
let overview = null;
const homeTarget = new THREE.Vector3();
const homeCamera = new THREE.Vector3();
const focusPosition = new THREE.Vector3();
const lastFocusPosition = new THREE.Vector3();

function setHome() {
  // Pull back on narrow screens so the outer planet still fits.
  const pull = camera.aspect < 1 ? 1.9 : 1;
  homeCamera.set(0, 14 * pull, 36 * pull);
}

function flyTo(body) {
  const reduced = motion.matches;
  flight = {
    body,
    start: performance.now(),
    duration: reduced ? 0 : body ? 1600 : 1400,
    fromCamera: camera.position.clone(),
    fromTarget: controls.target.clone(),
    toCamera: body ? null : overview?.camera ?? homeCamera.clone(),
    toTarget: body ? null : overview?.target ?? homeTarget.clone(),
  };
  controls.enabled = false;
  schedule();
}

function focus(body) {
  if (!focused) overview = { camera: camera.position.clone(), target: controls.target.clone() };
  focused = body;
  for (const other of bodies) other.button.setAttribute('aria-pressed', String(other === body));
  controls.minDistance = body.radius * 1.8;
  fadeHint();
  showPanel(body);
  flyTo(body);
}

function unfocus() {
  if (!focused) return;
  focused.button.setAttribute('aria-pressed', 'false');
  focused = null;
  panel.hidden = true;
  syncVideo();
  controls.minDistance = 4;
  flyTo(null);
  overview = null;
}

function updateCamera(now) {
  if (flight) {
    const p = orbits.flightProgress(now - flight.start, flight.duration);
    const toTarget = flight.body ? flight.body.group.position : flight.toTarget;
    const toCamera = flight.body
      ? orbits.framingPosition(toTarget, flight.body.radius, flight.fromCamera)
      : flight.toCamera;
    camera.position.lerpVectors(flight.fromCamera, toCamera, p);
    controls.target.lerpVectors(flight.fromTarget, toTarget, p);
    camera.lookAt(controls.target);
    if (p >= 1) {
      flight = null;
      controls.enabled = true;
    }
  } else if (focused) {
    // Ride along with the focused planet as it orbits.
    focusPosition.copy(focused.group.position).sub(lastFocusPosition);
    camera.position.add(focusPosition);
    controls.target.add(focusPosition);
  }
  if (focused) lastFocusPosition.copy(focused.group.position);
  if (!flight) controls.update();
}

/* ---------- Picking ---------- */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hovered = null;
let press = null;

function pick(event) {
  pointer.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(bodies.map(body => body.hit), false)[0];
  return hit ? hit.object.userData.body : null;
}

function setHovered(body) {
  if (hovered === body) return;
  hovered = body;
  canvas.classList.toggle('pointing', Boolean(body));
  schedule();
}

/* ---------- Konami Easter egg: warp speed ---------- */
let warp = null;
let simTime = 0;
const konami = orbits.createSequence();
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && focused) { unfocus(); return; }
  if (!event.key || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
  if (event.target.closest?.('input, textarea, select, [contenteditable]')) return;
  if (!konami(event.key)) return;
  if (motion.matches) { announce(); return; }
  if (!ready || warp) return;
  warp = { start: performance.now() };
  schedule();
});

/* ---------- Frame loop ---------- */
const labelPoint = new THREE.Vector3();

function updateBodies(dt, reduced, warpAmount) {
  if (!reduced) simTime += dt * (focused ? 0.35 : 1) * (1 + warpAmount * 30);
  for (const body of bodies) {
    if (body.orbit) {
      const p = orbits.orbitPosition(body.orbit, simTime);
      body.group.position.set(p.x, p.y, p.z);
    }
    if (!reduced) {
      body.spinner.rotation.y += dt * (body.orbit ? 0.12 : 0.03) * (1 + warpAmount * 8);
      if (body.moon) body.moon.rotation.y += dt * 0.5 * (1 + warpAmount * 8);
    }
    const lit = body === hovered || body === focused;
    if (body.line) body.line.material.opacity = lit ? 0.28 : 0.08;
  }
}

function updateLabels() {
  const width = window.innerWidth, height = window.innerHeight;
  for (const body of bodies) {
    labelPoint.copy(body.group.position);
    labelPoint.y += body.radius * (body.orbit ? 1.45 : 1.25);
    labelPoint.project(camera);
    const visible = labelPoint.z < 1 && Math.abs(labelPoint.x) < 1.1 && Math.abs(labelPoint.y) < 1.1 && body !== focused;
    body.label.hidden = !visible;
    if (!visible) continue;
    const x = (labelPoint.x * 0.5 + 0.5) * width;
    const y = (-labelPoint.y * 0.5 + 0.5) * height;
    body.label.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    body.label.classList.toggle('hot', body === hovered);
  }
}

function schedule() {
  if (scheduled || !ready || document.hidden) return;
  scheduled = true;
  requestAnimationFrame(frame);
}

function frame(now) {
  scheduled = false;
  if (!ready || document.hidden) return;
  const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
  last = now;
  const reduced = motion.matches;
  let warpAmount = 0;
  if (warp) {
    warpAmount = orbits.warpAmount(now - warp.start);
    if (now - warp.start >= 2400) warp = null;
  }
  camera.fov = BASE_FOV + warpAmount * 55;
  camera.updateProjectionMatrix();
  sunGlow.scale.setScalar(SUN_RADIUS * (7 + warpAmount * 5));
  updateBodies(dt, reduced, warpAmount);
  updateCamera(now);
  renderer.render(scene, camera);
  updateLabels();
  // With reduced motion, frames are drawn only when something changes.
  if (!reduced || flight || controls.enableDamping) schedule();
}

function resize() {
  const width = window.innerWidth, height = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  setHome();
  schedule();
}

function fadeHint() {
  hint.classList.add('faded');
}

function start() {
  root.classList.add('space');
  buildScene();
  buildInterface();
  resize();

  controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.minDistance = 4;
  controls.maxDistance = 120;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.8;
  controls.enableDamping = !motion.matches;
  controls.dampingFactor = 0.08;
  controls.addEventListener('change', schedule);
  controls.addEventListener('start', fadeHint);

  // Arrive from deep space; with reduced motion, start in place.
  camera.position.copy(homeCamera);
  if (!motion.matches) {
    camera.position.set(0, homeCamera.y * 3, homeCamera.z * 3.2);
    flyTo(null);
    flight.duration = 2600;
  }
  camera.lookAt(homeTarget);

  canvas.addEventListener('pointerdown', event => { press = { x: event.clientX, y: event.clientY }; });
  canvas.addEventListener('pointerup', event => {
    if (!press) return;
    const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
    press = null;
    if (moved > 6) return; // that was a drag
    const body = pick(event);
    if (!body) { unfocus(); return; }
    if (body === focused && body.href) window.open(body.href, '_blank', 'noopener');
    else focus(body);
  });
  canvas.addEventListener('pointermove', event => {
    if (event.pointerType === 'mouse' && !event.buttons) setHovered(pick(event));
  });
  canvas.addEventListener('pointerleave', () => setHovered(null));

  legend.hidden = false;
  hint.hidden = false;
  ready = true;
  schedule();
}

window.addEventListener('resize', () => { if (ready) resize(); });
document.addEventListener('visibilitychange', () => {
  syncVideo();
  if (!document.hidden) { last = 0; schedule(); }
});
motion.addEventListener('change', () => {
  if (motion.matches) {
    endDrop();
    stopWave();
    if (logo.fs) showLogo();
    warp = null;
    if (flight) flight.duration = 0;
  }
  if (controls) controls.enableDamping = !motion.matches;
  syncVideo();
  last = 0;
  schedule();
});

canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  ready = false;
  root.classList.remove('space'); // back to the plain page
});
canvas.addEventListener('webglcontextrestored', () => {
  root.classList.add('space');
  ready = true;
  schedule();
});

if (renderer) start();
