// Voxel homepage: the DOM keeps the real text, links and buttons, and a
// three.js scene draws them in 3D at the same screen positions.
import * as THREE from 'three';

const core = window.HomeV2Core;
const motion = motionSettings;
const root = document.documentElement;
const canvas = document.getElementById('scene');
const lettersEl = document.getElementById('title-letters');
const notice = document.getElementById('motion-notice');

const CAMERA_DISTANCE = 1100; // CSS pixels; the z = 0 plane maps 1:1 to the page.
const CARD_DEPTH = 28;
const IDLE_SPEED = 0.15;
const REST = { x: -0.08, y: -0.16 }; // a resting angle that shows the extrusion
const SHATTER_MS = 1900;
const ENTRANCE_MS = 1000;
const FONT = '"Space Grotesk", system-ui, sans-serif';

let ready = false;     // set once the scene is built and drawing
let scheduled = false;
let last = 0;

/* ---------- Title buttons (the logo Easter egg's real controls) ---------- */
let noticeTimer;
function announce() {
  notice.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice.hidden = true; }, 5000);
}

const buttons = Array.from('retrac.space', (char, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `title-letter${index >= 6 ? ' dim' : ''}`;
  button.textContent = char;
  button.setAttribute('aria-label', `Animate title: ${char}`);
  button.addEventListener('click', () => startFall(index));
  return button;
});
lettersEl.replaceChildren(...buttons);
lettersEl.removeAttribute('aria-hidden');

/* ---------- Renderer ---------- */
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
} catch {
  renderer = null; // Without WebGL the plain HTML page stays as it is.
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 10, 6000);
camera.position.z = CAMERA_DISTANCE;
let W = 0, H = 0, dpr = 1;

function resizeView() {
  W = canvas.clientWidth || window.innerWidth;
  H = canvas.clientHeight || window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  camera.aspect = W / H;
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(H / 2 / CAMERA_DISTANCE));
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(dpr);
  renderer.setSize(W, H, false);
}

// Box with lighting baked into vertex colors: front is lit, sides fall off.
// Order matches BoxGeometry's faces: +x, -x, +y, -y, +z, -z.
const SHADES = [0.34, 0.22, 0.6, 0.14, 1, 0.1];
function shadedBox(w, h, d) {
  const geometry = new THREE.BoxGeometry(w, h, d);
  const colors = [];
  for (const shade of SHADES) for (let i = 0; i < 4; i++) colors.push(shade, shade, shade);
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}
const brightMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, color: '#f3f0ff' });
const dimMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, color: '#8b86a3' });

/* ---------- Voxel text ---------- */
// Draws text exactly where the DOM box puts it, then samples it into cubes.
function voxelText(text, style, boxW, boxH, { cellRatio, depthRatio, material }) {
  const fs = parseFloat(style.fontSize);
  const cell = Math.max(2, Math.round(fs * cellRatio));
  const pad = Math.ceil(fs * 0.35);
  const raster = document.createElement('canvas');
  raster.width = Math.ceil(boxW + pad * 2);
  raster.height = Math.ceil(boxH + pad * 2);
  const ctx = raster.getContext('2d', { willReadFrequently: true });
  ctx.font = `${style.fontWeight} ${fs}px ${FONT}`;
  const spacing = parseFloat(style.letterSpacing);
  if (spacing && 'letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
  const metrics = ctx.measureText(text);
  const ascent = metrics.fontBoundingBoxAscent ?? fs * 0.92;
  const descent = metrics.fontBoundingBoxDescent ?? fs * 0.26;
  // CSS centers the font's content area in the line box.
  const baseline = (boxH - ascent - descent) / 2 + ascent;
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, pad, pad + baseline);
  const cells = core.voxelize(ctx.getImageData(0, 0, raster.width, raster.height).data, raster.width, raster.height, cell);

  const count = cells.length / 2;
  const depth = Math.max(cell * 2, fs * depthRatio);
  const mesh = new THREE.InstancedMesh(shadedBox(cell * 0.86, cell * 0.86, depth), material, Math.max(1, count));
  mesh.count = count;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const home = new Float32Array(count * 2);
  const centerX = pad + boxW / 2, centerY = pad + boxH / 2;
  let hx = 0, hy = 0;
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const x = cells[i * 2] - centerX;
    const y = centerY - cells[i * 2 + 1];
    home[i * 2] = x;
    home[i * 2 + 1] = y;
    hx = Math.max(hx, Math.abs(x) + cell / 2);
    hy = Math.max(hy, Math.abs(y) + cell / 2);
    mesh.setMatrixAt(i, matrix.makeTranslation(x, y, -depth / 2));
  }
  mesh.instanceMatrix.needsUpdate = true;
  return { mesh, home, count, cell, depth, fs, hx, hy };
}

function disposeVoxels(items) {
  for (const item of items) {
    item.mesh.removeFromParent();
    item.mesh.geometry.dispose();
    item.mesh.dispose();
  }
}

/* ---------- Title ---------- */
const titleGroup = new THREE.Group();
scene.add(titleGroup);
let letters = [];
let titleCenter = { x: 0, y: 0 };
const ripple = { x: -1e4, y: -1e4, over: false, strength: 0 };
const pointer = { x: 0, y: 0, mouse: false };
let entranceStart = -Infinity;
let fall = null;
let shatter = null;
let titleDirty = false;

function buildTitle() {
  disposeVoxels(letters);
  const box = lettersEl.getBoundingClientRect();
  titleCenter = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  letters = buttons.map((button, index) => {
    const rect = button.getBoundingClientRect();
    const voxels = voxelText(button.textContent, getComputedStyle(button), rect.width, rect.height, {
      cellRatio: 1 / 20, depthRatio: 0.24, material: index >= 6 ? dimMaterial : brightMaterial,
    });
    const letter = {
      ...voxels, button,
      ox: rect.left + rect.width / 2 - titleCenter.x,
      oy: titleCenter.y - (rect.top + rect.height / 2),
      startZ: new Float32Array(voxels.count),
      delay: new Float32Array(voxels.count),
      burst: new Float32Array(voxels.count * 3),
      spin: new Float32Array(voxels.count * 3),
    };
    for (let i = 0; i < voxels.count; i++) {
      letter.startZ[i] = -(300 + Math.random() * 900);
      letter.delay[i] = Math.random() * 450 + index * 45;
      // Burst direction: away from the letter's center and toward the camera.
      const x = voxels.home[i * 2], y = voxels.home[i * 2 + 1];
      const length = Math.hypot(x, y) || 1;
      const reach = 120 + Math.random() * 380;
      letter.burst[i * 3] = (x / length + (Math.random() - 0.5) * 0.8) * reach;
      letter.burst[i * 3 + 1] = (y / length + (Math.random() - 0.5) * 0.8) * reach;
      letter.burst[i * 3 + 2] = (Math.random() * 1.6 - 0.3) * reach;
      for (let k = 0; k < 3; k++) letter.spin[i * 3 + k] = (Math.random() - 0.5) * 9;
    }
    voxels.mesh.position.set(letter.ox, letter.oy, 0);
    titleGroup.add(voxels.mesh);
    return letter;
  });
  titleDirty = true;
}

const IDENTITY = new THREE.Matrix4().elements;
const tmpMatrix = new THREE.Matrix4();
const tmpPosition = new THREE.Vector3();
const tmpQuaternion = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();
const unitScale = new THREE.Vector3(1, 1, 1);

function updateTitle(now, dt, reduced) {
  const box = lettersEl.getBoundingClientRect();
  titleGroup.position.set(box.left + box.width / 2 - W / 2, H / 2 - (box.top + box.height / 2), 0);

  let rx = REST.x, ry = REST.y;
  if (!reduced) {
    if (pointer.mouse) {
      rx += (pointer.y / H - 0.5) * 0.36;
      ry += (pointer.x / W - 0.5) * 0.56;
    }
    // The logo leans back as it scrolls away.
    rx -= core.clamp(window.scrollY / H) * 0.9;
    const k = 1 - Math.exp(-dt * 6);
    titleGroup.rotation.x += (rx - titleGroup.rotation.x) * k;
    titleGroup.rotation.y += (ry - titleGroup.rotation.y) * k;
  } else {
    titleGroup.rotation.set(rx, ry, 0);
  }

  if (fall) updateFall(now, dt);

  // Hover wave, faded in and out like the original.
  const rippleTarget = !reduced && !fall && !shatter && ripple.over ? 1 : 0;
  ripple.strength += (rippleTarget - ripple.strength) * (1 - Math.exp(-dt * 14));
  if (!rippleTarget && ripple.strength < 0.005) ripple.strength = 0;

  const entranceElapsed = now - entranceStart;
  const entering = entranceElapsed < ENTRANCE_MS + 1100;
  const shatterAmount = shatter ? core.shatterAmount(now - shatter.start, SHATTER_MS) : 0;
  if (shatter && now - shatter.start >= SHATTER_MS) shatter = null;
  if (!entering && !ripple.strength && !shatterAmount && !titleDirty) return;
  titleDirty = entering || ripple.strength > 0 || shatterAmount > 0;

  const time = core.steppedTime(now);
  for (const letter of letters) {
    if (letter.mesh.parent !== titleGroup) continue; // falling letters move as a whole
    const array = letter.mesh.instanceMatrix.array;
    const radius = letter.fs * 0.75;
    const baseX = titleGroup.position.x + letter.ox;
    const baseY = titleGroup.position.y + letter.oy;
    for (let i = 0; i < letter.count; i++) {
      const hx = letter.home[i * 2], hy = letter.home[i * 2 + 1];
      let x = hx, y = hy, z = -letter.depth / 2;
      if (entering) z += letter.startZ[i] * core.entranceAmount(entranceElapsed, letter.delay[i], ENTRANCE_MS);
      if (ripple.strength) {
        z += core.rippleDepth(baseX + hx - ripple.x, baseY + hy - ripple.y, radius, time, ripple.strength, letter.cell / 2);
      }
      const offset = i * 16;
      if (shatterAmount) {
        x += letter.burst[i * 3] * shatterAmount;
        y += letter.burst[i * 3 + 1] * shatterAmount;
        z += letter.burst[i * 3 + 2] * shatterAmount;
        tmpEuler.set(letter.spin[i * 3] * shatterAmount, letter.spin[i * 3 + 1] * shatterAmount, letter.spin[i * 3 + 2] * shatterAmount);
        tmpMatrix.compose(tmpPosition.set(x, y, z), tmpQuaternion.setFromEuler(tmpEuler), unitScale);
        array.set(tmpMatrix.elements, offset);
      } else {
        array.set(IDENTITY, offset);
        array[offset + 12] = x;
        array[offset + 13] = y;
        array[offset + 14] = z;
      }
    }
    letter.mesh.instanceMatrix.needsUpdate = true;
  }
}

/* ---------- Easter egg: the letters fall in 3D ---------- */
const worldPosition = new THREE.Vector3();
function startFall(origin) {
  // Check the live preference on every attempt, including keyboard activation.
  if (motion.matches) { announce(); return; }
  if (!ready || fall || shatter || !letters.length) return;
  entranceStart = -Infinity;
  ripple.strength = 0;
  resetInstances();
  titleGroup.updateMatrixWorld(true);
  const bodies = letters.map(letter => {
    letter.mesh.getWorldPosition(worldPosition);
    return {
      x: worldPosition.x + W / 2, y: H / 2 - worldPosition.y, z: worldPosition.z,
      rx: titleGroup.rotation.x, ry: titleGroup.rotation.y, rz: 0,
      hx: letter.hx, hy: letter.hy, hz: letter.depth / 2,
    };
  });
  fall = { start: performance.now(), bodies: core.createFall(bodies, origin) };
  letters.forEach(letter => scene.attach(letter.mesh));
  schedule();
}

function updateFall(now, dt) {
  const elapsed = now - fall.start;
  const { FALL } = core;
  if (elapsed >= FALL.returnAt) {
    // Pop back in at the title's current position, even after scrolling.
    letters.forEach(letter => {
      if (letter.mesh.parent !== titleGroup) {
        titleGroup.add(letter.mesh);
        letter.mesh.position.set(letter.ox, letter.oy, 0);
        letter.mesh.rotation.set(0, 0, 0);
      }
      letter.mesh.visible = true;
    });
    const p = Math.min(1, (elapsed - FALL.returnAt) / FALL.popMs);
    titleGroup.scale.setScalar(0.6 + 0.4 * p + Math.sin(p * Math.PI) * 0.12);
    if (p >= 1) finishFall();
    return;
  }
  fall.bodies.forEach((body, index) => {
    const mesh = letters[index].mesh;
    core.stepFall(body, dt, elapsed, W, H, CAMERA_DISTANCE);
    mesh.visible = elapsed < FALL.disappearAt;
    mesh.position.set(body.x - W / 2, H / 2 - body.y, body.z);
    mesh.rotation.set(body.rx, body.ry, body.rz);
  });
}

function finishFall() {
  fall = null;
  titleGroup.scale.setScalar(1);
  letters.forEach(letter => {
    if (letter.mesh.parent !== titleGroup) titleGroup.add(letter.mesh);
    letter.mesh.position.set(letter.ox, letter.oy, 0);
    letter.mesh.rotation.set(0, 0, 0);
    letter.mesh.visible = true;
  });
}

function resetInstances() {
  titleDirty = true;
  const matrix = new THREE.Matrix4();
  for (const letter of letters) {
    for (let i = 0; i < letter.count; i++) {
      letter.mesh.setMatrixAt(i, matrix.makeTranslation(letter.home[i * 2], letter.home[i * 2 + 1], -letter.depth / 2));
    }
    letter.mesh.instanceMatrix.needsUpdate = true;
  }
}

// Second Easter egg: the Konami code shatters the logo into cubes.
const konami = core.createSequence();
document.addEventListener('keydown', event => {
  if (!event.key || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
  if (event.target.closest?.('input, textarea, select, [contenteditable]')) return;
  if (!konami(event.key)) return;
  if (motion.matches) { announce(); return; }
  if (!ready || fall || shatter) return;
  entranceStart = -Infinity;
  shatter = { start: performance.now() };
  schedule();
});

/* ---------- Section headings ---------- */
let headings = [];
function buildHeadings() {
  disposeVoxels(headings);
  headings = [...document.querySelectorAll('.vox')].map(el => {
    const rect = el.getBoundingClientRect();
    const voxels = voxelText(el.textContent, getComputedStyle(el), rect.width, rect.height, {
      cellRatio: 1 / 14, depthRatio: 0.3, material: brightMaterial,
    });
    const group = new THREE.Group();
    group.add(voxels.mesh);
    scene.add(group);
    return { ...voxels, el, group };
  });
}

function updateHeadings(dt, reduced) {
  const k = reduced ? 1 : 1 - Math.exp(-dt * 6);
  for (const heading of headings) {
    const rect = heading.el.getBoundingClientRect();
    const visible = rect.bottom > -200 && rect.top < H + 200;
    heading.group.visible = visible;
    if (!visible) continue;
    // Headings pivot on their left edge, so they swing in like a door.
    heading.mesh.position.x = rect.width / 2;
    heading.group.position.set(rect.left - W / 2, H / 2 - (rect.top + rect.height / 2), 0);
    let rx = REST.x, ry = REST.y * 0.6, z = 0;
    if (!reduced) {
      const hidden = 1 - core.easeOutCubic(core.revealAmount(rect.top, H));
      ry += hidden * 1.1; // the far edge swings in from behind the page
      z -= hidden * 240;
      if (pointer.mouse) {
        rx += (pointer.y / H - 0.5) * 0.2;
        ry += (pointer.x / W - 0.5) * 0.3;
      }
    }
    heading.group.rotation.x += (rx - heading.group.rotation.x) * k;
    heading.group.rotation.y += (ry - heading.group.rotation.y) * k;
    heading.group.position.z = z;
  }
}

/* ---------- Project cards: thick slabs with a pixel-ripple video face ---------- */
const cardGeometry = shadedBox(1, 1, 1);
const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
// Idle cards are chunky pixels; a hover sends rings of sharper pixels outward
// from the cursor (16 -> 10 -> 6 -> 4 -> 2 -> sharp), like the original cards.
const fragmentShader = `
  uniform sampler2D map;
  uniform sampler2D label;
  uniform vec2 size;
  uniform vec2 videoSize;
  uniform vec2 origin;
  uniform float front;
  uniform float band;
  uniform float ready;
  varying vec2 vUv;

  vec3 videoAt(vec2 uv, float pixel) {
    vec2 scale = size / videoSize;
    float cover = max(scale.x, scale.y);
    vec2 visible = size / cover / videoSize;
    vec2 st = 0.5 + (uv - 0.5) * visible;
    float lod = log2(max(1.0, pixel / cover));
    return textureLod(map, st, lod).rgb;
  }

  void main() {
    vec2 p = vUv * size;
    vec2 block = (floor(p / 16.0) + 0.5) * 16.0;
    float d = distance(block, origin);
    float pixel = 16.0;
    if (d < front) pixel = 10.0;
    if (d < front - band) pixel = 6.0;
    if (d < front - 2.0 * band) pixel = 4.0;
    if (d < front - 3.0 * band) pixel = 2.0;
    if (d < front - 4.0 * band) pixel = 0.0;
    vec2 q = pixel > 0.0 ? (floor(p / pixel) + 0.5) * pixel : p;
    vec3 color = mix(vec3(0.0035, 0.002, 0.014), videoAt(q / size, max(pixel, 1.0)), ready);
    vec4 text = texture2D(label, vUv);
    gl_FragColor = vec4(mix(color, text.rgb, text.a), 1.0);
    #include <colorspace_fragment>
  }
`;

const SIDE = new THREE.Color('#2e2840');
const SIDE_FOCUS = new THREE.Color('#9c94c4');

const cards = [...document.querySelectorAll('.card')].map(el => {
  const video = el.querySelector('video');
  // VideoTexture (not Texture): three.js sizes video uploads differently.
  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true; // mip levels average the video into each big pixel
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  const front = new THREE.ShaderMaterial({
    vertexShader, fragmentShader,
    uniforms: {
      map: { value: texture }, label: { value: null },
      size: { value: new THREE.Vector2(1, 1) }, videoSize: { value: new THREE.Vector2(16, 9) },
      origin: { value: new THREE.Vector2() }, front: { value: 0 }, band: { value: 1 }, ready: { value: 0 },
    },
  });
  const side = new THREE.MeshBasicMaterial({ vertexColors: true, color: SIDE.clone() });
  const mesh = new THREE.Mesh(cardGeometry, [side, side, side, side, front, side]);
  mesh.visible = false;
  scene.add(mesh);
  const card = {
    el, video, texture, front, side, mesh, name: el.querySelector('.card-name').textContent,
    w: 0, h: 0, hover: false, focus: false, r: 0, ox: 0.5, oy: 0.5, u: 0.5, v: 0.5,
    speed: IDLE_SPEED, tiltX: 0, tiltY: 0, lift: 0,
  };
  video.playbackRate = IDLE_SPEED;
  const loaded = () => {
    if (!video.videoWidth) return;
    front.uniforms.videoSize.value.set(video.videoWidth, video.videoHeight);
    front.uniforms.ready.value = 1;
    texture.needsUpdate = true;
    schedule();
  };
  video.addEventListener('loadeddata', loaded);
  video.addEventListener('seeked', loaded);
  video.addEventListener('error', () => { front.uniforms.ready.value = 0; schedule(); });
  if (video.readyState >= 2) loaded();

  const setOrigin = event => {
    const rect = el.getBoundingClientRect();
    card.ox = (event.clientX - rect.left) / rect.width;
    card.oy = (event.clientY - rect.top) / rect.height;
  };
  el.addEventListener('pointerenter', event => {
    if (event.pointerType !== 'mouse') return;
    if (card.r < 0.05) setOrigin(event); // a new ripple starts where the cursor lands
    card.hover = true;
    schedule();
  });
  el.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse') return;
    const rect = el.getBoundingClientRect();
    card.u = (event.clientX - rect.left) / rect.width;
    card.v = (event.clientY - rect.top) / rect.height;
  });
  el.addEventListener('pointerleave', () => { card.hover = false; schedule(); });
  el.addEventListener('focus', () => {
    card.focus = el.matches(':focus-visible');
    if (card.focus && card.r < 0.05) { card.ox = 0.5; card.oy = 0.5; }
    schedule();
  });
  el.addEventListener('blur', () => { card.focus = false; schedule(); });
  return card;
});

// The card name and its shade are drawn into a texture over the video face.
function drawLabel(card) {
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = Math.max(1, Math.round(card.w * dpr));
  labelCanvas.height = Math.max(1, Math.round(card.h * dpr));
  const ctx = labelCanvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const shade = ctx.createLinearGradient(0, card.h, 0, card.h - 72);
  shade.addColorStop(0, 'rgba(0, 0, 0, 0.75)');
  shade.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, card.h - 72, card.w, 72);
  ctx.font = `600 24px ${FONT}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '-0.24px';
  ctx.fillStyle = '#f3f0ff';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(card.name, 24, card.h - 27);
  // A new texture per size: resizing an uploaded texture in place is not reliable.
  card.front.uniforms.label.value?.dispose();
  const label = new THREE.CanvasTexture(labelCanvas);
  label.colorSpace = THREE.SRGBColorSpace;
  card.front.uniforms.label.value = label;
}

function updateCard(card, dt, reduced) {
  const rect = card.el.getBoundingClientRect();
  if (Math.abs(rect.width - card.w) > 0.5 || Math.abs(rect.height - card.h) > 0.5 || card.dpr !== dpr) {
    card.w = rect.width;
    card.h = rect.height;
    card.dpr = dpr;
    card.front.uniforms.size.value.set(card.w, card.h);
    drawLabel(card);
  }
  const visible = rect.bottom > -150 && rect.top < H + 150;
  card.mesh.visible = visible;

  // Videos idle slowly and play at full speed under the cursor, as before.
  const play = visible && !reduced && !document.hidden;
  if (play && card.video.paused) card.video.play().catch(() => {});
  else if (!play && !card.video.paused) card.video.pause();
  const active = card.hover || card.focus;
  card.speed += ((active ? 1 : IDLE_SPEED) - card.speed) * Math.min(1, dt * 4);
  if (Math.abs(card.video.playbackRate - card.speed) > 0.01) card.video.playbackRate = card.speed;
  if (!card.video.paused && card.video.readyState >= 2) card.texture.needsUpdate = true;
  if (!visible) return;

  card.r = reduced ? (active ? 1 : 0) : core.clamp(card.r + (active ? 1 : -1.4) * dt / 0.9);
  const originX = card.ox * card.w, originY = (1 - card.oy) * card.h;
  const { front, band } = core.rippleFront(card.r, card.w, card.h, originX, originY);
  card.front.uniforms.origin.value.set(originX, originY);
  card.front.uniforms.front.value = front;
  card.front.uniforms.band.value = band;
  card.side.color.copy(card.focus ? SIDE_FOCUS : SIDE);

  const tilt = card.hover && !reduced ? core.cardTilt(card.u, card.v) : { x: 0, y: 0 };
  const k = reduced ? 1 : 1 - Math.exp(-dt * 8);
  card.tiltX += (tilt.x - card.tiltX) * k;
  card.tiltY += (tilt.y - card.tiltY) * k;
  card.lift += ((active && !reduced ? 36 : 0) - card.lift) * k;
  // Cards rise out of the page as they scroll into view.
  const hidden = reduced ? 0 : 1 - core.easeOutCubic(core.revealAmount(rect.top, H));
  card.mesh.scale.set(card.w, card.h, CARD_DEPTH);
  card.mesh.position.set(rect.left + card.w / 2 - W / 2, H / 2 - (rect.top + card.h / 2), -CARD_DEPTH / 2 + card.lift - hidden * 520);
  card.mesh.rotation.set(card.tiltX + hidden * 0.6, card.tiltY, 0);
}

/* ---------- Frame loop ---------- */

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
  if (canvas.clientWidth !== W || canvas.clientHeight !== H) resizeView();
  updateTitle(now, dt, reduced);
  updateHeadings(dt, reduced);
  for (const card of cards) updateCard(card, dt, reduced);
  renderer.render(scene, camera);
  // With reduced motion, frames are drawn only when something changes.
  if (!reduced) schedule();
}

function build() {
  if (fall) finishFall();
  shatter = null;
  buildTitle();
  buildHeadings();
}

let resizeTimer;
window.addEventListener('resize', () => {
  if (!ready) return;
  if (fall) finishFall();
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { build(); schedule(); }, 150);
  schedule();
});
window.addEventListener('scroll', schedule, { passive: true });
window.addEventListener('pointermove', event => {
  if (event.pointerType !== 'mouse') return;
  pointer.mouse = true;
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  const box = lettersEl.getBoundingClientRect();
  const margin = box.height * 0.3;
  ripple.over = event.clientX > box.left - margin && event.clientX < box.right + margin
    && event.clientY > box.top - margin && event.clientY < box.bottom + margin;
  ripple.x = event.clientX - W / 2;
  ripple.y = H / 2 - event.clientY;
}, { passive: true });
document.addEventListener('pointerout', event => {
  if (!event.relatedTarget) { pointer.mouse = false; ripple.over = false; }
});
window.addEventListener('blur', () => {
  pointer.mouse = false;
  ripple.over = false;
  cards.forEach(card => { card.hover = false; });
  schedule();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cards.forEach(card => card.video.pause());
  else { last = 0; schedule(); }
});
motion.addEventListener('change', () => {
  if (motion.matches) {
    if (fall) finishFall();
    shatter = null;
    entranceStart = -Infinity;
    ripple.strength = 0;
    resetInstances();
  }
  last = 0;
  schedule();
});

canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  ready = false;
  root.classList.remove('gl'); // fall back to the plain HTML page
});
canvas.addEventListener('webglcontextrestored', () => {
  ready = true;
  cards.forEach(card => { card.texture.needsUpdate = true; card.w = 0; });
  root.classList.add('gl');
  schedule();
});

if (renderer) {
  // Measure with the real font; never wait on it forever.
  const fonts = Promise.all([700, 600].map(weight => document.fonts.load(`${weight} 100px "Space Grotesk"`))).catch(() => {});
  Promise.race([fonts, new Promise(resolve => setTimeout(resolve, 1500))]).then(() => {
    resizeView();
    build();
    if (!motion.matches) entranceStart = performance.now();
    ready = true;
    root.classList.add('gl');
    schedule();
  });
}
