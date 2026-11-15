// Pure helpers for the solar system homepage. No DOM or WebGL, so Node can test them.
(function (root) {
  'use strict';

  const TAU = Math.PI * 2;
  const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  // Same timeline as the original title Easter egg.
  const DROP = { gravity: 2400, throughAt: 2500, disappearAt: 2800, returnAt: 3300, popMs: 180 };

  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const easeInOutCubic = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

  // Position on a circular orbit, tilted about the x axis. `seconds` is
  // simulation time, so freezing it (reduced motion) freezes the system.
  function orbitPosition({ radius, period, phase = 0, tilt = 0 }, seconds) {
    const angle = phase + (period ? (seconds / period) * TAU : 0);
    const x = Math.cos(angle) * radius;
    const flat = Math.sin(angle) * radius;
    return { x, y: -flat * Math.sin(tilt), z: flat * Math.cos(tilt) };
  }

  const lerp = (a, b, t) => a + (b - a) * t;
  const lerp3 = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) });

  // Where the camera parks to look at a body: along the current viewing
  // direction, lifted a little, at a distance that frames the body's size.
  function framingPosition(body, radius, camera, lift = 0.35) {
    let dx = camera.x - body.x, dy = camera.y - body.y, dz = camera.z - body.z;
    const flat = Math.hypot(dx, dz) || 1;
    dx /= flat; dz /= flat;
    dy = lift;
    const length = Math.hypot(dx, dy, dz);
    const distance = radius * 4.2 + 2.5;
    return { x: body.x + (dx / length) * distance, y: body.y + (dy / length) * distance, z: body.z + (dz / length) * distance };
  }

  // Progress of a camera flight (0..1, eased). Instant when duration is 0.
  function flightProgress(elapsed, duration) {
    return duration > 0 ? easeInOutCubic(clamp(elapsed / duration)) : 1;
  }

  // Warp (Konami) envelope: rises, holds briefly, settles. 0 at rest.
  function warpAmount(elapsed, duration = 2400) {
    const p = elapsed / duration;
    if (p <= 0 || p >= 1) return 0;
    return Math.sin(p * Math.PI) ** 2;
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

  // Title letters drop in a chain from the clicked one, like the original.
  // Offsets are in screen pixels from each letter's home (y points down).
  function createDrop(count, origin, random = Math.random) {
    return Array.from({ length: count }, (_, index) => ({
      x: 0, y: 0, angle: 0,
      vx: (random() - 0.5) * 420, vy: -100 - random() * 160, spin: (random() - 0.5) * 9,
      delay: Math.abs(index - origin) * 48,
      restitution: 0.25 + random() * 0.2,
    }));
  }

  // `floor` is how far the letter's bottom may travel before it hits the
  // bottom of the viewport; `left`/`right` bound sideways travel the same way.
  function stepDrop(s, dt, elapsed, { floor, left, right }) {
    if (elapsed < s.delay || elapsed >= DROP.disappearAt) return;
    s.vy += DROP.gravity * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.angle += s.spin * dt;
    if (s.x < left || s.x > right) {
      s.x = clamp(s.x, left, right);
      s.vx *= -0.6;
      s.spin *= -0.7;
    }
    if (elapsed < DROP.throughAt && s.y > floor) {
      s.y = floor;
      s.vy = -Math.abs(s.vy) * s.restitution;
      s.vx *= 0.8;
      s.spin *= 0.65;
    }
  }

  const api = {
    TAU, KONAMI, DROP, clamp, easeInOutCubic, orbitPosition, lerp3, framingPosition,
    flightProgress, warpAmount, createSequence, createDrop, stepDrop,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SpaceOrbits = api;
})(typeof window !== 'undefined' ? window : globalThis);
