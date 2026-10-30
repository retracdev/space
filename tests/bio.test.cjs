const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require("node:path").join(__dirname, "../bio.js"), "utf8");

async function loadBio({ reduced = false, canvasAvailable = true, fontsFail = false } = {}) {
  function events(target = {}) {
    target.listeners = {};
    target.addEventListener = (name, callback) => { target.listeners[name] = callback; };
    target.removeEventListener = (name) => { delete target.listeners[name]; };
    return target;
  }
  const classes = new Set();
  const node = { textContent: "A bio that wraps onto another line." };
  node.length = node.textContent.length;
  const text = { firstChild: node };
  const content = {
    children: [text],
    classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name) },
    getBoundingClientRect: () => ({ left: 24, top: 160, width: 300, height: 100 }),
    querySelectorAll: () => [text],
    appendChild(child) { this.children.push(child); },
  };
  const frames = new Map(), timers = new Map(), draws = [];
  let id = 0;
  const motion = events({ matches: reduced });
  const window = events({ devicePixelRatio: 2 });
  const document = events({
    hidden: false,
    fonts: { ready: fontsFail ? Promise.reject(Error("font unavailable")) : Promise.resolve() },
    getElementById: () => content,
    createElement() {
      return {
        setAttribute(name, value) { this[name] = value; },
        remove() { content.children = content.children.filter((child) => child !== this); },
        getContext: () => canvasAvailable ? {
          scale() {}, clearRect() {},
          measureText: () => ({ fontBoundingBoxDescent: 4 }),
          fillText(...args) { draws.push(args); },
          drawImage() {},
        } : null,
      };
    },
    createRange() {
      let offset;
      return {
        setStart(node, i) { offset = i; }, setEnd() {},
        getBoundingClientRect: () => ({ left: 24 + offset % 16 * 8,
          top: 160 + Math.floor(offset / 16) * 30, bottom: 184 + Math.floor(offset / 16) * 30 }),
      };
    },
  });
  vm.runInNewContext(source, {
    document, window, matchMedia: () => motion,
    getComputedStyle: () => ({ fontWeight: "400", fontSize: "20px", fontFamily: "sans-serif", color: "white", letterSpacing: "0px" }),
    performance: { now: () => 0 },
    requestAnimationFrame(callback) { frames.set(++id, callback); return id; },
    cancelAnimationFrame: (id) => frames.delete(id),
    setTimeout(callback) { timers.set(++id, callback); return id; },
    clearTimeout: (id) => timers.delete(id),
  });
  await Promise.resolve();
  await Promise.resolve();
  function tick(now) {
    const batch = [...frames.values()];
    frames.clear();
    batch.forEach((callback) => callback(now));
  }
  return { content, classes, frames, timers, motion, window, document, draws, tick, node };
}

function assertRestored(bio) {
  assert.equal(bio.classes.size, 0);
  assert.equal(bio.content.children.length, 1, "temporary canvas is removed");
  assert.equal(bio.frames.size, 0);
  assert.equal(bio.timers.size, 0);
  assert.equal(Object.keys(bio.window.listeners).length, 0);
  assert.equal(Object.keys(bio.motion.listeners).length, 0);
  assert.equal(Object.keys(bio.document.listeners).length, 0);
}

test("bio raster follows wrapped DOM lines and hands back to real text after the reveal", async () => {
  const bio = await loadBio();
  assert.ok(bio.classes.has("is-revealing"));
  assert.equal(bio.content.children[1]["aria-hidden"], "true");
  assert.equal(bio.draws.map(([text]) => text).join(""), bio.node.textContent);
  assert.ok(bio.draws[1][2] > bio.draws[0][2], "wrapped lines retain their vertical positions");
  bio.tick(550);
  assert.equal(bio.frames.size, 1);
  bio.tick(1100);
  assertRestored(bio);
});

test("reduced motion, unavailable canvas and failed fonts leave readable HTML", async () => {
  for (const options of [{ reduced: true }, { canvasAvailable: false }, { fontsFail: true }]) {
    assertRestored(await loadBio(options));
  }
});

test("resize, live motion changes, hidden tabs and the deadline restore text and clean up", async () => {
  for (const action of [
    (bio) => bio.window.listeners.resize(),
    (bio) => { bio.motion.matches = true; bio.motion.listeners.change(); },
    (bio) => { bio.document.hidden = true; bio.document.listeners.visibilitychange(); },
    (bio) => [...bio.timers.values()][0](),
  ]) {
    const bio = await loadBio();
    action(bio);
    assertRestored(bio);
  }
});
