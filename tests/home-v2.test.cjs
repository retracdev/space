const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../home-v2/core.js');

const dir = path.join(__dirname, '../home-v2');
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const scene = fs.readFileSync(path.join(dir, 'home-v2.js'), 'utf8');
const original = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

test('voxelize keeps cells that are at least half covered', () => {
  const width = 8, height = 4, data = new Uint8ClampedArray(width * height * 4);
  // Fill the left 4x4 block fully and 6 of 16 pixels of the right block.
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) data[(y * width + x) * 4 + 3] = 255;
  for (let i = 0; i < 6; i++) data[((i % 2) * width + 4 + Math.floor(i / 2)) * 4 + 3] = 255;
  assert.deepEqual(core.voxelize(data, width, height, 4), [2, 2]);
});

test('the Konami code matches after overlapping prefixes and resets afterwards', () => {
  const feed = core.createSequence();
  const keys = ['ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'B', 'a'];
  assert.deepEqual(keys.map(feed).map((hit, i) => hit && i), [...Array(10).fill(false), 10]);
  assert.equal(feed('a'), false);
});

test('falling letters bounce on the visible floor, then fall through and vanish', () => {
  const [body] = core.createFall([{ x: 400, y: 500, hx: 30, hy: 40, hz: 10 }], 0, () => 0.5);
  const { FALL } = core;
  let elapsed = 0, bounced = false;
  while (elapsed < FALL.throughAt - 20) {
    const before = body.vy;
    core.stepFall(body, 1 / 60, elapsed, 800, 600, 1100);
    if (before > 0 && body.vy <= 0) bounced = true;
    elapsed += 1000 / 60;
    assert.ok(body.y + core.rotatedExtents(body).y <= 600 + 1e-6, 'never sinks through the floor early');
  }
  assert.ok(bounced);
  for (; elapsed < FALL.disappearAt; elapsed += 1000 / 60) core.stepFall(body, 1 / 60, elapsed, 800, 600, 1100);
  assert.ok(body.y > 600, 'drops off screen after the fall-through point');
  const frozen = body.y;
  core.stepFall(body, 1 / 60, FALL.disappearAt + 1, 800, 600, 1100);
  assert.equal(body.y, frozen);
});

test('the floor moves with depth so letters near the camera still land on screen', () => {
  const near = { x: 400, y: 0, z: 200, vx: 0, vy: 5000, vz: 0, rx: 0, ry: 0, rz: 0, sx: 0, sy: 0, sz: 0, hx: 10, hy: 10, hz: 10, delay: 0, restitution: 0.3 };
  core.stepFall(near, 0.2, 100, 800, 600, 1000);
  const visibleBottom = 300 + 300 * (1000 - near.z) / 1000;
  assert.ok(Math.abs(near.y + 10 - visibleBottom) < 1e-6);
});

test('letters wait for their chain-reaction delay', () => {
  const bodies = core.createFall([0, 1, 2, 3].map(x => ({ x, y: 0, hx: 1, hy: 1, hz: 1 })), 2, () => 0.5);
  assert.deepEqual(bodies.map(b => b.delay), [96, 48, 0, 48]);
  const before = { ...bodies[0] };
  core.stepFall(bodies[0], 1 / 60, 50, 800, 600, 1100);
  assert.deepEqual(bodies[0], before);
});

test('hover wave and ripple helpers stay inside their bounds', () => {
  assert.equal(core.rippleDepth(100, 0, 100, 1, 1), 0);
  assert.equal(core.rippleDepth(10, 0, 100, 1, 0), 0);
  const depth = core.rippleDepth(20, 10, 100, 0.3, 1, 4);
  assert.equal(Math.abs(depth % 4), 0);
  assert.ok(Math.abs(depth) <= 22);
  assert.equal(core.steppedTime(54), 0);
  assert.equal(core.rippleFront(0, 100, 50, 0, 0).front, 0);
  const full = core.rippleFront(1, 100, 50, 0, 0);
  assert.ok(Math.abs(full.front - (Math.hypot(100, 50) + full.band * 4)) < 1e-9);
});

test('entrance and shatter start and end at rest', () => {
  assert.equal(core.entranceAmount(0, 0), 1);
  assert.equal(core.entranceAmount(2000, 0), 0);
  assert.equal(core.shatterAmount(0), 0);
  assert.equal(core.shatterAmount(1900), 0);
  assert.ok(core.shatterAmount(680) > 0.99);
  assert.equal(core.revealAmount(900, 800), 0);
  assert.equal(core.revealAmount(400, 800), 1);
});

test('v2 keeps the original copy, links and videos without invented taglines', () => {
  for (const paragraph of original.match(/<p>[^<]+<\/p>/g)) assert.ok(html.includes(paragraph), paragraph);
  for (const link of ['https://soundboard.retrac.space/', 'https://glowstudio.retrac.space/', 'https://surprise.retrac.space/',
    'https://retraclabs.io/?utm_source=retrac.space&amp;utm_medium=referral&amp;utm_campaign=personal_site']) assert.ok(html.includes(`href="${link}"`), link);
  const names = [...html.matchAll(/class="card-name">([^<]+)</g)].map(m => m[1]);
  assert.deepEqual(names, ['Simple Soundboard', 'Glow', "Retrac's Rickroll", 'Retrac Labs']);
  for (const src of html.matchAll(/src="(\/assets\/[^"#]+)/g)) assert.ok(fs.existsSync(path.join(__dirname, '..', src[1])), src[1]);
  assert.doesNotMatch(html, /TRUST THIS|EXPERIMENT 0|IN ORBIT|EXPLORE THE PROJECTS|STAYS IN PLACE/i);
});

test('v2 loads motion settings first, pins three.js and has no motion toggle', () => {
  assert.ok(html.indexOf('/motion.js') < html.indexOf('home-v2.css'));
  assert.ok(html.indexOf('/motion.js') < html.indexOf('home-v2.js'));
  assert.ok(html.indexOf('./core.js') < html.indexOf('./home-v2.js'));
  assert.match(html, /three@\d+\.\d+\.\d+\/build\/three\.module\.js/);
  assert.doesNotMatch(html, /type="checkbox"|motion-toggle|aria-pressed/);
  assert.match(html, /id="motion-notice"[^>]*hidden>Unable to play that animation because you have reduce motion on\.</);
});

test('both Easter eggs check reduced motion on every attempt', () => {
  const fall = scene.slice(scene.indexOf('function startFall'), scene.indexOf('function updateFall'));
  assert.match(fall, /if \(motion\.matches\) \{ announce\(\); return; \}/);
  const konami = scene.slice(scene.indexOf("document.addEventListener('keydown'"), scene.indexOf('/* ---------- Section headings'));
  assert.match(konami, /if \(motion\.matches\) \{ announce\(\); return; \}/);
  assert.match(scene, /if \(!reduced\) schedule\(\);/, 'no continuous loop with reduced motion');
});
