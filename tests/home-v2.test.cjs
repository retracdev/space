const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const orbits = require('../home-v2/orbits.js');

const dir = path.join(__dirname, '../home-v2');
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const space = fs.readFileSync(path.join(dir, 'space.js'), 'utf8');
const original = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const close = (a, b) => Math.abs(a - b) < 1e-9;

test('planets travel a full orbit in one period and freeze when time stops', () => {
  const orbit = { radius: 10, period: 80, phase: 1, tilt: 0.1 };
  const start = orbits.orbitPosition(orbit, 0);
  const lap = orbits.orbitPosition(orbit, 80);
  assert.ok(close(start.x, lap.x) && close(start.y, lap.y) && close(start.z, lap.z));
  assert.ok(close(Math.hypot(start.x, start.y, start.z), 10), 'stays on its circle');
  assert.notDeepEqual(orbits.orbitPosition(orbit, 20), start);
});

test('the camera frames a planet from the side it is viewed, at a size-based distance', () => {
  const body = { x: 10, y: 0, z: 0 };
  const view = orbits.framingPosition(body, 1, { x: 10, y: 50, z: 30 });
  const distance = Math.hypot(view.x - 10, view.y, view.z);
  assert.ok(close(distance, 1 * 4.2 + 2.5));
  assert.ok(view.z > 0 && view.y > 0, 'from the viewer side and slightly above');
  assert.ok(orbits.framingPosition(body, 2, { x: 0, y: 0, z: 30 }).z > view.z);
});

test('camera flights ease from 0 to 1 and are instant without a duration', () => {
  assert.equal(orbits.flightProgress(0, 1600), 0);
  assert.equal(orbits.flightProgress(800, 1600), 0.5);
  assert.equal(orbits.flightProgress(2000, 1600), 1);
  assert.equal(orbits.flightProgress(0, 0), 1);
});

test('warp starts and ends at rest and peaks in the middle', () => {
  assert.equal(orbits.warpAmount(0), 0);
  assert.equal(orbits.warpAmount(2400), 0);
  assert.ok(close(orbits.warpAmount(1200), 1));
});

test('the Konami code matches after overlapping prefixes and resets afterwards', () => {
  const feed = orbits.createSequence();
  const keys = ['ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'B', 'a'];
  assert.deepEqual(keys.map(feed).map((hit, i) => hit && i), [...Array(10).fill(false), 10]);
  assert.equal(feed('a'), false);
});

test('title letters chain from the clicked one, bounce on the floor, then fall through', () => {
  const drops = orbits.createDrop(4, 2, () => 0.5);
  assert.deepEqual(drops.map(d => d.delay), [96, 48, 0, 48]);
  const letter = drops[2];
  const { DROP } = orbits;
  const bounds = { floor: 500, left: -50, right: 700 };
  let elapsed = 0, bounced = false;
  for (; elapsed < DROP.throughAt - 20; elapsed += 1000 / 60) {
    const falling = letter.vy > 0;
    orbits.stepDrop(letter, 1 / 60, elapsed, bounds);
    if (falling && letter.vy <= 0) bounced = true;
    assert.ok(letter.y <= 500, 'never below the floor before the fall-through point');
  }
  assert.ok(bounced);
  for (; elapsed < DROP.disappearAt; elapsed += 1000 / 60) orbits.stepDrop(letter, 1 / 60, elapsed, bounds);
  assert.ok(letter.y > 500);
  const waiting = { ...drops[0] };
  orbits.stepDrop(drops[0], 1 / 60, 50, bounds);
  assert.deepEqual(drops[0], waiting, 'waits for its chain delay');
});

test('every project is a planet with a real link, the original copy and an existing video', () => {
  for (const paragraph of original.match(/<p>[^<]+<\/p>/g)) assert.ok(html.includes(paragraph), paragraph);
  const planets = [...html.matchAll(/data-planet="(\w+)"[^>]*data-video="([^"#]+)[^>]*>\s*<a href="([^"]+)"[^>]*>([^<]+)</g)];
  assert.deepEqual(planets.map(m => m[4]), ['Simple Soundboard', 'Toptext', 'Glow', "Retrac's Rickroll", 'Retrac Labs']);
  for (const [, key, video, href] of planets) {
    assert.match(space, new RegExp(`\\b${key}: \\{`), `${key} has a planet style`);
    assert.ok(fs.existsSync(path.join(__dirname, '..', video)), video);
    assert.match(href, /^https:\/\//);
  }
  assert.ok(html.includes('utm_source=retrac.space&amp;utm_medium=referral&amp;utm_campaign=personal_site'));
});

test('the page loads motion settings first, pins three.js and has no motion toggle', () => {
  assert.ok(html.indexOf('/motion.js') < html.indexOf('space.css'));
  assert.ok(html.indexOf('./orbits.js') < html.indexOf('./space.js'));
  assert.match(html, /"three": "https:\/\/cdn\.jsdelivr\.net\/npm\/three@(\d+\.\d+\.\d+)\/build\/three\.module\.js"/);
  assert.match(html, /"three\/addons\/": "https:\/\/cdn\.jsdelivr\.net\/npm\/three@\d+\.\d+\.\d+\/examples\/jsm\/"/);
  assert.doesNotMatch(html, /type="checkbox"|motion-toggle/);
  assert.match(html, /id="motion-notice"[^>]*hidden>Unable to play that animation because you have reduce motion on\.</);
});

test('the V1 pixel logo sits in the header with its letter buttons and respects reduced motion', () => {
  assert.match(html, /<h1 class="title">[\s\S]*<canvas id="logo"[\s\S]*id="title-letters"[\s\S]*<\/h1>/);
  assert.match(space, /const LOGO_STEPS = \[56, 40, 28, 20, 14, 10, 7, 5, 3, 2, 1\]/, 'same pixel resolve as V1');
  const playLogo = space.slice(space.indexOf('function playLogo'), space.indexOf('function trackLogoPointer'));
  assert.match(playLogo, /if \(motion\.matches\) \{ showLogo\(\); return; \}/, 'no intro with reduced motion');
  const hover = space.slice(space.indexOf('function trackLogoPointer'), space.indexOf('function stopWave'));
  assert.match(hover, /if \(motion\.matches \|\| event\.pointerType === 'touch'\) return;/, 'no hover wave with reduced motion');
  // Regression: the first frame used to see dt = 0, leave strength at 0 and stop the loop at once.
  const waveFrame = space.slice(space.indexOf('function waveFrame'), space.indexOf('/* Easter egg'));
  assert.match(waveFrame, /wave\.last \? [^:]+ : 1 \/ 60/, 'the first frame always advances the wave');
  assert.match(waveFrame, /if \(wave\.active\) requestAnimationFrame\(waveFrame\);\s*else wave\.running = false;/, 'never stops while hovered');
});

test('reduced motion is checked on every Easter egg attempt and stops continuous rendering', () => {
  const dropStart = space.slice(space.indexOf('function startDrop'), space.indexOf('function dropFrame'));
  assert.match(dropStart, /if \(motion\.matches\) \{ announce\(\); return; \}/);
  const konami = space.slice(space.indexOf("document.addEventListener('keydown'"), space.indexOf('/* ---------- Frame loop'));
  assert.match(konami, /if \(motion\.matches\) \{ announce\(\); return; \}/);
  assert.match(space, /duration: reduced \? 0 :/, 'camera flights are instant');
  assert.match(space, /if \(!reduced\) simTime \+=/, 'orbits stand still');
  assert.match(space, /!motion\.matches && !document\.hidden\) panelVideo\.play/, 'previews stay paused');
});
