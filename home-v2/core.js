// Pure helpers for the voxel homepage. No DOM or WebGL, so Node can test them.
(function (root) {
  'use strict';

  // Same timeline as the original title Easter egg.
  const FALL = { gravity: 2400, throughAt: 2500, disappearAt: 2800, returnAt: 3300, popMs: 180 };
  const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const easeOutCubic = t => 1 - (1 - t) ** 3;
  const easeInOutQuad = t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
  const easeInOutCubic = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

  // Turns RGBA glyph pixels into cell centers [x0, y0, x1, y1, ...].
  // A cell is solid when at least `threshold` of it is covered.
  function voxelize(data, width, height, cell, threshold = 0.5) {
    const cells = [];
    const limit = threshold * 255 * cell * cell;
    for (let y = 0; y + cell <= height; y += cell) {
      for (let x = 0; x + cell <= width; x += cell) {
        let sum = 0;
        for (let j = 0; j < cell; j++) {
          let index = ((y + j) * width + x) * 4 + 3;
          for (let i = 0; i < cell; i++, index += 4) sum += data[index];
        }
        if (sum >= limit) cells.push(x + cell / 2, y + cell / 2);
      }
    }
    return cells;
  }

  // Remaining entrance offset: 1 at the start, 0 once the voxel has landed.
  function entranceAmount(elapsed, delay, duration = 1000) {
    return 1 - easeOutCubic(clamp((elapsed - delay) / duration));
  }

  // Depth push for the hover wave. A stepped clock and whole-unit offsets keep
  // the original title's digital cadence.
  function steppedTime(now) {
    return Math.floor(now / 55) * 0.055;
  }
  function rippleDepth(dx, dy, radius, time, strength, unit = 0) {
    const distance = Math.hypot(dx, dy) / radius;
    if (distance >= 1 || strength <= 0) return 0;
    const envelope = (1 - distance * distance) ** 2;
    const depth = Math.sin(distance * 9 - time * 8) * radius * 0.22 * envelope * strength;
    return (unit ? Math.round(depth / unit) * unit : depth) || 0;
  }

  // Konami "shatter": voxels burst out, then ease home. 0 means at rest.
  function shatterAmount(elapsed, duration = 1900) {
    const p = elapsed / duration;
    if (p <= 0 || p >= 1) return 0;
    if (p < 0.36) return easeOutCubic(p / 0.36);
    return 1 - easeInOutCubic((p - 0.36) / 0.64);
  }

  // Pixel-ring front for the card hover ripple, as in the original cards.
  function rippleFront(progress, width, height, originX, originY, levels = 5, bandRatio = 0.16) {
    const maxDistance = Math.max(
      Math.hypot(originX, originY), Math.hypot(width - originX, originY),
      Math.hypot(originX, height - originY), Math.hypot(width - originX, height - originY),
    );
    const band = bandRatio * Math.hypot(width, height);
    const total = maxDistance + band * (levels - 1);
    return { front: easeInOutQuad(clamp(progress)) * total, band };
  }

  // Cards lean away from the cursor, as if pressed where you point.
  function cardTilt(u, v, strength = 1) {
    return { x: (clamp(v) - 0.5) * 0.3 * strength, y: (clamp(u) - 0.5) * 0.36 * strength };
  }

  // 0 while an element is below the fold, 1 once it is 40% of a screen in.
  function revealAmount(top, viewportHeight) {
    return clamp((viewportHeight - top) / (viewportHeight * 0.4));
  }

  // Remembers recent keys so overlapping prefixes (up, up, up, down...) still match.
  function createSequence(sequence = KONAMI) {
    const recent = [];
    return key => {
      recent.push(key.length === 1 ? key.toLowerCase() : key);
      if (recent.length > sequence.length) recent.shift();
      const matched = recent.length === sequence.length && recent.every((value, i) => value === sequence[i]);
      if (matched) recent.length = 0;
      return matched;
    };
  }

  // Each falling letter is a rigid body in screen pixels (y points down).
  function createFall(letters, origin, random = Math.random) {
    return letters.map((letter, index) => ({
      x: letter.x, y: letter.y, z: letter.z || 0,
      vx: (random() - 0.5) * 420, vy: -100 - random() * 160, vz: (random() - 0.35) * 320,
      rx: letter.rx || 0, ry: letter.ry || 0, rz: letter.rz || 0,
      sx: (random() - 0.5) * 7, sy: (random() - 0.5) * 7, sz: (random() - 0.5) * 9,
      hx: letter.hx, hy: letter.hy, hz: letter.hz,
      delay: Math.abs(index - origin) * 48,
      restitution: 0.25 + random() * 0.2,
    }));
  }

  // Half-size of a rotated box on screen (matches three.js 'XYZ' Euler order).
  function rotatedExtents({ rx, ry, rz, hx, hy, hz }) {
    const a = Math.cos(rx), b = Math.sin(rx), c = Math.cos(ry), d = Math.sin(ry), e = Math.cos(rz), f = Math.sin(rz);
    const m11 = c * e, m12 = -c * f, m13 = d;
    const m21 = a * f + b * e * d, m22 = a * e - b * f * d, m23 = -b * c;
    return {
      x: Math.abs(m11) * hx + Math.abs(m12) * hy + Math.abs(m13) * hz,
      y: Math.abs(m21) * hx + Math.abs(m22) * hy + Math.abs(m23) * hz,
    };
  }

  // Walls and floor are where the viewport edges sit at the letter's depth,
  // so a letter that drifts toward the camera still bounces on the visible floor.
  function stepFall(s, dt, elapsed, width, height, cameraDistance) {
    if (elapsed < s.delay || elapsed >= FALL.disappearAt) return;
    s.vy += FALL.gravity * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.z += s.vz * dt;
    if (Math.abs(s.z) > 260) {
      s.z = Math.sign(s.z) * 260;
      s.vz *= -0.5;
    }
    s.rx += s.sx * dt;
    s.ry += s.sy * dt;
    s.rz += s.sz * dt;
    const scale = (cameraDistance - s.z) / cameraDistance;
    const left = width / 2 - (width / 2) * scale;
    const right = width / 2 + (width / 2) * scale;
    const floor = height / 2 + (height / 2) * scale;
    const extent = rotatedExtents(s);
    if (s.x < left + extent.x || s.x > right - extent.x) {
      s.x = clamp(s.x, left + extent.x, right - extent.x);
      s.vx *= -0.6;
      s.sz *= -0.7;
    }
    if (elapsed < FALL.throughAt && s.y + extent.y > floor) {
      s.y = floor - extent.y;
      s.vy = -Math.abs(s.vy) * s.restitution;
      s.vx *= 0.8;
      s.vz *= 0.7;
      s.sx *= 0.65;
      s.sy *= 0.65;
      s.sz *= 0.65;
    }
  }

  const api = {
    FALL, KONAMI, clamp, easeOutCubic, voxelize, entranceAmount, steppedTime, rippleDepth,
    shatterAmount, rippleFront, cardTilt, revealAmount, createSequence, createFall, rotatedExtents, stepFall,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HomeV2Core = api;
})(typeof window !== 'undefined' ? window : globalThis);
