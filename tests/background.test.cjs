const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../background.js'), 'utf8');

function load({ reduced = false, supported = true, compileOK = true, random = .25 } = {}) {
  const listeners = {};
  const frames = new Map();
  const calls = { draws: 0, shaders: [], times: [], tweaks: [], deleted: 0, random: 0 };
  const gl = {
    createShader: () => ({}),
    shaderSource: (_, source) => calls.shaders.push(source),
    compileShader() {}, getShaderParameter: () => compileOK,
    getShaderInfoLog: () => 'test compile failure',
    deleteShader() { calls.deleted++; },
    createProgram: () => ({}), attachShader() {}, linkProgram() {},
    getProgramParameter: () => true, deleteProgram() {}, useProgram() {},
    getUniformLocation: (_, name) => name,
    uniform4f: (name, ...values) => calls.tweaks.push([name, ...values]),
    uniform3f() {}, uniform1f: (_, value) => calls.times.push(value),
    drawArrays() { calls.draws++; }, viewport() {},
  };
  const on = (name, callback) => { listeners[name] = callback; };
  const canvas = { width: 300, height: 150, style: {},
    getContext: () => supported ? gl : null, addEventListener: on };
  const motion = { matches: reduced, addEventListener: on };
  const document = { hidden: false, getElementById: () => canvas, addEventListener: on };
  let id = 0;
  const context = vm.createContext({
    document, matchMedia: () => motion, addEventListener: on,
    innerWidth: 1200, innerHeight: 800, performance: { now: () => 0 },
    console: { warn() {} },
    Math: Object.assign(Object.create(Math), { random: () => { calls.random++; return random; } }),
    requestAnimationFrame(callback) { frames.set(++id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id),
  });
  vm.runInContext(source, context);
  function tick(now) {
    const [id, callback] = frames.entries().next().value;
    frames.delete(id);
    callback(now);
  }
  return { calls, frames, listeners, canvas, motion, document, context, tick };
}

test('randomizes once per load; clicks cannot reshuffle and resize retains parameters', () => {
  const a = load(), b = load({ random: .85 });
  assert.equal(a.calls.random, 11); // shader, eight tweaks, hue, time
  assert.notEqual(a.canvas.style.filter, b.canvas.style.filter);
  assert.notEqual(a.calls.shaders[1], b.calls.shaders[1]);
  assert.notDeepEqual(a.calls.tweaks, b.calls.tweaks);
  assert.equal(a.listeners.click, undefined);
  const tweaks = structuredClone(a.calls.tweaks);
  a.listeners.resize();
  a.tick(40);
  assert.deepEqual(a.calls.tweaks, tweaks);
  assert.equal(a.calls.random, 11);
  assert.equal(a.frames.size, 1);
});

test('throttles animation and caps backing pixels at large viewport sizes', () => {
  const state = load();
  state.tick(10);
  assert.equal(state.calls.draws, 1);
  state.tick(40);
  assert.equal(state.calls.draws, 2);
  assert.ok(state.calls.times[1] > state.calls.times[0]);
  state.context.innerWidth = 7680;
  state.context.innerHeight = 4320;
  state.listeners.resize();
  assert.ok(state.canvas.width * state.canvas.height <= 8e6);
  assert.equal(state.frames.size, 1);
});

test('reduced motion draws a still that resizes and responds to preference changes', () => {
  const state = load({ reduced: true });
  assert.equal(state.calls.draws, 1);
  assert.equal(state.frames.size, 0);
  state.listeners.resize();
  assert.equal(state.calls.draws, 2);
  assert.equal(state.calls.times[0], state.calls.times[1]);
  state.motion.matches = false;
  state.listeners.change();
  assert.equal(state.frames.size, 1);
  state.tick(50);
  state.motion.matches = true;
  state.listeners.change();
  assert.equal(state.frames.size, 0);
});

test('visibility and page cache lifecycle pause and resume exactly one loop', () => {
  const state = load();
  state.document.hidden = true;
  state.listeners.visibilitychange();
  assert.equal(state.frames.size, 0);
  state.document.hidden = false;
  state.listeners.visibilitychange();
  state.listeners.pageshow();
  assert.equal(state.frames.size, 1);
  state.listeners.pagehide();
  assert.equal(state.frames.size, 0);
  state.listeners.pageshow();
  assert.equal(state.frames.size, 1);
  assert.equal(state.calls.random, 11);
});

test('context restoration rebuilds the same shader and parameters without rerolling', () => {
  const state = load();
  let prevented = false;
  state.listeners.webglcontextlost({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(state.frames.size, 0);
  assert.equal(state.canvas.style.visibility, 'hidden');
  state.listeners.webglcontextrestored();
  assert.equal(state.canvas.style.visibility, '');
  assert.equal(state.frames.size, 1);
  assert.equal(state.calls.shaders[1], state.calls.shaders[3]);
  assert.deepEqual(state.calls.tweaks.slice(0, 2), state.calls.tweaks.slice(2));
  assert.equal(state.calls.random, 11);
});

test('unavailable WebGL and compilation failure leave fallback without a render loop', () => {
  const unsupported = load({ supported: false });
  assert.equal(unsupported.frames.size, 0);
  assert.equal(unsupported.calls.draws, 0);
  const failed = load({ compileOK: false });
  assert.equal(failed.frames.size, 0);
  assert.equal(failed.calls.draws, 0);
  assert.equal(failed.calls.deleted, 2);
  assert.equal(failed.canvas.style.visibility, 'hidden');
});
