const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../new-look.js'), 'utf8');

function page(pathname = '/', cookie = '', { blocked = false, protocol = 'https:' } = {}) {
  const events = {}, attributes = {}, redirects = [], writes = [];
  const toggle = {
    hidden: true,
    setAttribute(name, value) { attributes[name] = value; },
    addEventListener(name, callback) { events[name] = callback; },
  };
  const document = {
    get cookie() {
      if (blocked) throw new Error('Storage blocked');
      return cookie;
    },
    set cookie(value) {
      if (blocked) throw new Error('Storage blocked');
      writes.push(value);
      cookie = value.includes('Max-Age=0;') ? '' : value.split(';')[0];
    },
    getElementById: () => toggle,
    addEventListener(name, callback) { events[name] = callback; },
  };
  vm.runInNewContext(source, {
    document,
    window: {
      location: { pathname, protocol, search: '?reduce_motion=true', hash: '#projects', replace: url => redirects.push(url) },
      addEventListener(name, callback) { events[name] = callback; },
    },
  });
  events.DOMContentLoaded();
  return { events, attributes, redirects, writes, toggle, document };
}

test('opt-in persists the preference and redirects future homepage visits', () => {
  const home = page();
  assert.deepEqual(home.redirects, []);
  assert.equal(home.toggle.hidden, false);
  assert.equal(home.attributes['aria-checked'], 'false');
  home.events.click();
  assert.match(home.writes[0], /^retrac_new_look=1; Path=\/; Max-Age=31536000; SameSite=Lax; Secure$/);
  assert.deepEqual(home.redirects, ['/home-v2/?reduce_motion=true#projects']);
  for (const pathname of ['/', '/index.html']) {
    assert.deepEqual(page(pathname, 'other=1; retrac_new_look=1').redirects, ['/home-v2/?reduce_motion=true#projects']);
  }
});

test('V2 can be opened directly and turning it off clears the cookie before returning home', () => {
  for (const pathname of ['/home-v2', '/home-v2/', '/home-v2/index.html']) {
    const v2 = page(pathname, 'retrac_new_look=1');
    assert.deepEqual(v2.redirects, []);
    assert.equal(v2.attributes['aria-checked'], 'true');
    v2.events.click();
    assert.match(v2.writes[0], /^retrac_new_look=0; Path=\/; Max-Age=0; SameSite=Lax; Secure$/);
    assert.deepEqual(v2.redirects, ['/?reduce_motion=true#projects']);
    assert.deepEqual(page('/', v2.document.cookie).redirects, []);
  }
  assert.equal(page('/home-v2/').attributes['aria-checked'], 'true');
});

test('only the exact opt-in cookie redirects, and only on the original homepage', () => {
  for (const cookie of ['', 'retrac_new_look=0', 'other_retrac_new_look=1', 'retrac_new_look=10']) {
    assert.deepEqual(page('/', cookie).redirects, []);
  }
  assert.deepEqual(page('/other/', 'retrac_new_look=1').redirects, []);
});

test('back cache restoration rechecks the current cookie', () => {
  const home = page();
  home.document.cookie = 'retrac_new_look=1';
  home.events.pageshow();
  assert.deepEqual(home.redirects, ['/home-v2/?reduce_motion=true#projects']);
});

test('blocked cookies still allow switching and HTTP development omits Secure', () => {
  const blocked = page('/', '', { blocked: true });
  blocked.events.click();
  assert.deepEqual(blocked.redirects, ['/home-v2/?reduce_motion=true#projects']);
  const local = page('/', '', { protocol: 'http:' });
  local.events.click();
  assert.doesNotMatch(local.writes[0], /Secure/);
});

test('both homepages load the redirect early and put the switch before the account region', () => {
  for (const file of ['index.html', 'home-v2/index.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    assert.ok(html.indexOf('src="/new-look.js"') < html.indexOf('<body>'));
    assert.ok(html.indexOf('id="new-look-toggle"') < html.indexOf('id="account"'));
    assert.match(html, /role="switch"[^>]*>Try out the new look<\/button>/);
    assert.ok(html.includes('href="/new-look.css"'));
  }
});
