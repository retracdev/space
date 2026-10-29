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
      this.style = {};
      this.listeners = {};
      this.classList = { add() {}, remove() {}, toggle() {} };
      this.context = {
        draws: [],
        text: [],
        letterSpacing: "0px",
        measureText(text) { return { width: text.length * parseFloat(this.font.split(" ")[1]) * 0.6 }; },
        fillText(...args) { this.text.push(args); },
        drawImage(...args) { this.draws.push(args); },
        createLinearGradient() { return { addColorStop() {} }; },
      };
      for (const name of ["clearRect", "fillRect", "beginPath", "arc", "fill", "stroke", "moveTo", "lineTo", "save", "rect", "clip", "restore"]) {
        this.context[name] = () => {};
      }
      if (tag === "video") {
        this.readyState = 2;
        this.videoWidth = 1920;
        this.videoHeight = 1080;
        this.playCalls = 0;
        this.playbackRate = 1;
        this.play = () => { this.playCalls++; this.rateAtPlay = this.playbackRate; return Promise.resolve(); };
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
  title.parentElement = { fontSize: "168px", fontWeight: "700", letterSpacing: "-6.72px" };
  const projectsTitle = new Element("canvas");
  projectsTitle.parentElement = { fontSize: "32px", fontWeight: "600", letterSpacing: "-0.64px" };
  const frames = [];
  const context = vm.createContext({
    document: {
      createElement: (tag) => new Element(tag),
      getElementById: (id) => ({ projects: container, title, "projects-title": projectsTitle })[id],
      fonts: { load: () => new Promise(() => {}) },
    },
    window: { devicePixelRatio: 1, addEventListener() {} },
    matchMedia: (query) => ({ matches: query.includes("reduced-motion") && reduceMotion }),
    performance: { now: () => 0 },
    getComputedStyle: (element) => element,
    requestAnimationFrame(callback) { frames.push(callback); },
    setTimeout() {},
  });
  vm.runInContext(source, context);
  vm.runInContext("resizeCards()", context);
  return { context, cards: vm.runInContext("cards", context), container, title, projectsTitle, frames };
}

test("both headings resolve together and retain their typography after resizing", () => {
  const { context, title, projectsTitle, frames } = loadCards();
  vm.runInContext("sizeTitle(); playTitle(() => { globalThis.finished = true; })", context);
  frames.shift()(0);
  const firstWidth = projectsTitle.context.draws.at(-1)[3];
  assert.equal(projectsTitle.context.globalAlpha, 1);
  assert.equal(projectsTitle.context.imageSmoothingEnabled, false);
  frames.shift()(522.5);
  assert.ok(projectsTitle.context.draws.at(-1)[3] > firstWidth);
  assert.equal(context.finished, undefined);
  frames.shift()(1045);
  assert.equal(context.finished, true);
  for (const canvas of [title, projectsTitle]) {
    const draw = canvas.context.draws.at(-1);
    assert.equal(draw[3], canvas.width, "final frame resolves at full resolution");
  }
  const off = projectsTitle.context.draws.at(-1)[0];
  assert.equal(off.context.text.at(-1)[0], "Featured Projects");
  assert.equal(off.context.font, '600 32px "Space Grotesk", system-ui, sans-serif');
  assert.equal(off.context.letterSpacing, "-0.64px");
  projectsTitle.parentElement.fontSize = "24px";
  vm.runInContext("sizeTitle(); drawTitle()", context);
  assert.equal(off.context.font, '600 24px "Space Grotesk", system-ui, sans-serif');
});

test("reduced motion renders both headings sharp without scheduling animation", () => {
  const { context, title, projectsTitle, frames } = loadCards(true);
  vm.runInContext("sizeTitle(); playTitle(() => { globalThis.finished = true; })", context);
  assert.equal(context.finished, true);
  assert.equal(frames.length, 0);
  for (const canvas of [title, projectsTitle]) {
    assert.equal(canvas.context.draws.at(-1)[3], canvas.width);
  }
});

test("video card stays in the shared idle, hover ripple, and return animation", () => {
  const { context, cards } = loadCards();
  assert.equal(cards.length, 2);
  const card = cards[0];
  const video = card.el.querySelector("video");
  assert.equal(video.playCalls, 1);
  assert.equal(video.rateAtPlay, 0.15, "video starts at the shared idle speed");

  vm.runInContext("frame(16)", context);
  assert.equal(video.playbackRate, 0.15);
  assert.equal(card.ctx.imageSmoothingEnabled, false);
  assert.equal(card.offs[16].cv.width, 36);
  assert.equal(card.offs[16].ctx.draws.at(-1)[0], video);

  card.el.listeners.pointerenter({ pointerType: "mouse", clientX: 100, clientY: 80 });
  for (let now = 32; now <= 400; now += 16) vm.runInContext(`frame(${now})`, context);
  assert.ok(card.r > 0 && card.r < 1);
  assert.ok(video.playbackRate > 0.15 && video.playbackRate < 1);
  assert.equal(video.playbackRate, card.speed, "video follows the shared hover acceleration");
  assert.equal(card.offs[10].ctx.draws.at(-1)[0], video);

  for (let now = 416; now <= 1200; now += 16) vm.runInContext(`frame(${now})`, context);
  assert.equal(card.r, 1);
  assert.ok(video.playbackRate > 0.99 && video.playbackRate <= 1);
  assert.equal(card.offs[1].cv.width, 576);
  assert.equal(card.offs[1].ctx.draws.at(-1)[0], video);

  card.el.listeners.pointerleave({ pointerType: "mouse" });
  const hoveredRate = video.playbackRate;
  vm.runInContext("frame(1216)", context);
  assert.ok(video.playbackRate < hoveredRate && video.playbackRate > 0.15);
  assert.equal(video.playbackRate, card.speed, "video follows the shared return to idle");
  for (let now = 1232; now <= 2208; now += 16) vm.runInContext(`frame(${now})`, context);
  assert.ok(Math.abs(video.playbackRate - 0.15) < 0.02);
  assert.equal(card.r, 0);
  assert.equal(card.ctx.draws.at(-1)[0], card.offs[16].cv);
  assert.ok(cards[1].offs[16], "the Rickroll card also renders");
  assert.equal(cards[1].offs[16].ctx.draws.at(-1)[0], cards[1].video);
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
  const rickroll = cards[1];
  assert.equal(rickroll.el.tagName, "a");
  assert.equal(rickroll.el.href, "https://surprise.retrac.space/");
  assert.equal(rickroll.el.target, "_blank");
  assert.equal(rickroll.el.rel, "noopener noreferrer");
  assert.ok(rickroll.el.html.includes("<h2>Retrac's Rickroll</h2>"));
  assert.ok(rickroll.el.html.includes('src="assets/retrac-rickroll-loop.mp4"'));
  assert.equal(rickroll.video.playCalls, 0);
  assert.ok(!rickroll.el.html.includes("autoplay"));
});
