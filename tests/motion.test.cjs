const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../motion.js'), 'utf8');

test('only reduce_motion=true forces motion reduction and marks the CSS override', () => {
  for (const search of ['', '?reduce_motion=false', '?reduce_motion=1', '?reduce_motion',
    '?reduce_motion=TRUE', '?other=true', '?reduce_motion=true', '?other=1&reduce_motion=true']) {
    for (const reduced of [false, true]) {
      const attributes = {};
      const preference = { matches: reduced };
      const context = vm.createContext({
        URLSearchParams, window: { location: { search } },
        matchMedia: () => preference,
        document: { documentElement: { setAttribute(name, value) { attributes[name] = value; } } },
      });
      vm.runInContext(source, context);
      const forced = search.endsWith('reduce_motion=true');
      assert.equal(vm.runInContext('motionSettings.matches', context), forced || reduced, search);
      assert.equal(attributes['data-reduce-motion'], forced ? 'true' : undefined, search);
      preference.matches = !reduced;
      assert.equal(vm.runInContext('motionSettings.matches', context), forced || !reduced, search);
    }
  }
});

test('motion settings load before styles and all animation scripts', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  for (const file of ['styles.css', 'background.js', 'bio.js', 'main.js']) {
    assert.ok(html.indexOf('src="motion.js"') < html.indexOf(file));
  }
});
