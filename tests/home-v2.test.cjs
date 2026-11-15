const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise event behavior without launching a browser.
function boot(reduced = false) {
  function element() {
    const events = {};
    return {
      events, children: [], styles: {}, hidden: true, plays: 0, pauses: 0,
      addEventListener(name, callback) { (events[name] ||= []).push(callback); },
      emit(name, event = {}) { return Promise.all((events[name] || []).map(fn => fn(event))); },
      setAttribute() {}, removeAttribute() {},
      replaceChildren(...children) { this.children = children; },
      style: { setProperty() {}, removeProperty() {} },
      classList: { add() {}, remove() {}, toggle() { return true; } },
      getBoundingClientRect() { return { left: 0, top: 0, width: 400, height: 300 }; },
      play() { this.plays++; return Promise.resolve(); },
      pause() { this.pauses++; },
      closest() { return this.link || null; },
      animate() {
        let reject;
        const animation = { finished: new Promise((_, fail) => { reject = fail; }), cancel() { reject(new Error('Cancelled')); } };
        animations.push(animation);
        return animation;
      },
    };
  }
  const animations = [];
  const ids = Object.fromEntries(['stage', 'wordmark-plane', 'letters', 'notice'].map(id => [id, element()]));
  const video = element();
  video.link = element();
  const document = Object.assign(element(), {
    hidden: false, body: element(), getElementById: id => ids[id],
    createElement: element, querySelectorAll: selector => selector === 'video' ? [video] : [],
  });
  const motion = Object.assign(element(), { matches: reduced });
  const window = element();
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../home-v2/home-v2.js'), 'utf8'), {
    document, window, motionSettings: motion, matchMedia: () => ({ matches: true }),
    setTimeout: () => 1, clearTimeout() {},
  });
  return { ids, video, document, motion, animations };
}

test('v2 logo supports keyboard activation and live reduced motion cancels its fall', async () => {
  const { ids, animations, motion } = boot();
  assert.equal(ids.letters.children.length, 12);
  const activation = ids.letters.children[3].emit('click');
  assert.equal(animations.length, 12);
  motion.matches = true;
  await motion.emit('change');
  await activation;
  await ids.letters.children[3].emit('click');
  assert.equal(animations.length, 12);
  assert.equal(ids.notice.hidden, false);
  assert.match(ids.notice.textContent, /Reduced motion/);
});

test('v2 videos play on deliberate interaction and pause when motion is reduced or the tab is hidden', async () => {
  const { video, motion, document } = boot();
  assert.equal(video.plays, 0);
  await video.link.emit('pointerenter', { pointerType: 'touch' });
  assert.equal(video.plays, 0);
  await video.link.emit('focusin');
  assert.equal(video.plays, 1);
  document.hidden = true;
  await document.emit('visibilitychange');
  assert.ok(video.pauses > 0);
  motion.matches = true;
  document.hidden = false;
  await motion.emit('change');
  await video.link.emit('pointerenter', { pointerType: 'mouse' });
  assert.equal(video.plays, 1);
});

test('v2 secret code stays available as a static discovery under reduced motion', async () => {
  const { document, ids, animations } = boot(true);
  for (const key of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']) {
    await document.emit('keydown', { key, target: { closest: () => null } });
  }
  assert.equal(animations.length, 0);
  assert.equal(ids.notice.hidden, false);
  assert.match(ids.notice.textContent, /Secret orbit discovered/);
});
