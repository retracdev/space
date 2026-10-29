const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../main.js"), "utf8");

function loadCards(reduceMotion = false) {
  class Element {
    constructor(tag) {
      this.tagName = tag;
      this.children = [];
      this.listeners = {};
      this.classList = { add() {}, remove() {}, toggle() {} };
      this.context = {
        draws: [],
        drawImage(...args) { this.draws.push(args); },
        createLinearGradient() { return { addColorStop() {} }; },
      };
      for (const name of ["fillRect", "beginPath", "arc", "fill", "stroke", "moveTo", "lineTo", "save", "rect", "clip", "restore"]) {
        this.context[name] = () => {};
      }
      if (tag === "video") {
        this.readyState = 2;
        this.videoWidth = 1920;
        this.videoHeight = 1080;
        this.playCalls = 0;
        this.play = () => { this.playCalls++; return Promise.resolve(); };
      }
    }
    set innerHTML(html) {
      this.html = html;
      for (const tag of ["canvas", "video"]) {
        if (html.includes(`<${tag}`)) this.children.push(new Element(tag));
      }
    }
    getContext() { return this.context; }
    appendChild(child) { this.children.push(child); }
    querySelector(tag) { return this.children.find((child) => child.tagName === tag) || null; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 576, height: 324 }; }
  }
  const container = new Element("main");
  const title = new Element("canvas");
  const context = vm.createContext({
    document: {
      createElement: (tag) => new Element(tag),
      getElementById: (id) => id === "projects" ? container : title,
      fonts: { load: () => new Promise(() => {}) },
    },
    window: { devicePixelRatio: 1, addEventListener() {} },
    matchMedia: (query) => ({ matches: query.includes("reduced-motion") && reduceMotion }),
    performance: { now: () => 0 },
    requestAnimationFrame() {},
    setTimeout() {},
  });
  vm.runInContext(source, context);
  vm.runInContext("resizeCards()", context);
  return { context, cards: vm.runInContext("cards", context), container };
}

test("video card stays in the shared idle, hover ripple, and return animation", () => {
  const { context, cards } = loadCards();
  assert.equal(cards.length, 2);
  const card = cards[0];
  const video = card.el.querySelector("video");
  assert.equal(video.playCalls, 1);

  vm.runInContext("frame(16)", context);
  assert.equal(card.ctx.imageSmoothingEnabled, false);
  assert.equal(card.offs[16].cv.width, 36);
  assert.equal(card.offs[16].ctx.draws.at(-1)[0], video);

  card.el.listeners.pointerenter({ pointerType: "mouse", clientX: 100, clientY: 80 });
  for (let now = 32; now <= 400; now += 16) vm.runInContext(`frame(${now})`, context);
  assert.ok(card.r > 0 && card.r < 1);
  assert.equal(card.offs[10].ctx.draws.at(-1)[0], video);

  for (let now = 416; now <= 1200; now += 16) vm.runInContext(`frame(${now})`, context);
  assert.equal(card.r, 1);
  assert.equal(card.offs[1].cv.width, 576);
  assert.equal(card.offs[1].ctx.draws.at(-1)[0], video);

  card.el.listeners.pointerleave({ pointerType: "mouse" });
  for (let now = 1216; now <= 2208; now += 16) vm.runInContext(`frame(${now})`, context);
  assert.equal(card.r, 0);
  assert.equal(card.ctx.draws.at(-1)[0], card.offs[16].cv);
  assert.ok(cards[1].offs[16], "the procedural card still renders");
});

test("video loading and aspect ratios are safe for canvas rendering", () => {
  const { cards } = loadCards();
  const card = cards[0];
  const video = card.el.querySelector("video");
  const draw = { fillRect() {}, drawImage(...args) { this.args = args; } };
  video.readyState = 0;
  card.draw(draw, 160, 90);
  assert.equal(draw.args, undefined);
  video.readyState = 2;
  video.videoWidth = 0;
  card.draw(draw, 160, 90);
  assert.equal(draw.args, undefined);

  video.videoWidth = 1920;
  card.draw(draw, 160, 90);
  assert.deepEqual(draw.args, [video, 0, 0, 1920, 1080, 0, 0, 160, 90]);
  card.draw(draw, 100, 100);
  assert.deepEqual(draw.args, [video, 420, 0, 1080, 1080, 0, 0, 100, 100]);
  video.videoWidth = 1080;
  video.videoHeight = 1920;
  card.draw(draw, 100, 100);
  assert.deepEqual(draw.args, [video, 0, 420, 1080, 1080, 0, 0, 100, 100]);
});

test("the full-card referral link and reduced-motion playback are preserved", () => {
  const { cards } = loadCards(true);
  const card = cards[0];
  assert.equal(card.el.tagName, "a");
  assert.equal(card.el.href, "https://retraclabs.io/?utm_source=retrac.space&utm_medium=referral&utm_campaign=personal_site");
  assert.equal(card.el.target, "_blank");
  assert.equal(card.el.rel, "noopener noreferrer");
  assert.equal(card.el.querySelector("video").playCalls, 0);
  assert.ok(!card.el.html.includes("autoplay"));
  assert.equal(cards[1].el.tagName, "article");
});
