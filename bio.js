(() => {
  const content = document.getElementById("bio-content");
  const motion = motionSettings;
  if (!content || motion.matches) return;

  const steps = [18, 14, 10, 7, 5, 3, 2, 1];
  const duration = 1100;
  let canvas, frame, fallback;
  let finished = false;

  function finish() {
    finished = true;
    cancelAnimationFrame(frame);
    clearTimeout(fallback);
    content.classList.remove("is-revealing");
    canvas?.remove();
    window.removeEventListener("resize", finish);
    motion.removeEventListener("change", finish);
    document.removeEventListener("visibilitychange", onVisibility);
  }

  function onVisibility() {
    if (document.hidden) finish();
  }

  function reveal() {
    if (motion.matches || document.hidden) return;
    const bounds = content.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const source = document.createElement("canvas");
    source.width = Math.ceil(bounds.width * dpr);
    source.height = Math.ceil(bounds.height * dpr);
    const ctx = source.getContext("2d");
    canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    canvas.className = "bio-reveal";
    canvas.setAttribute("aria-hidden", "true");
    const output = canvas.getContext("2d");
    const small = document.createElement("canvas");
    const pixels = small.getContext("2d");
    if (!ctx || !output || !pixels) return;
    ctx.scale(dpr, dpr);

    // Measure the browser's actual wrapped lines, so the temporary raster
    // follows the responsive HTML instead of maintaining a second text copy.
    for (const element of content.querySelectorAll("h2, p")) {
      const css = getComputedStyle(element);
      const node = element.firstChild;
      const range = document.createRange();
      ctx.font = `${css.fontWeight} ${css.fontSize} ${css.fontFamily}`;
      ctx.fillStyle = css.color;
      if ("letterSpacing" in ctx) ctx.letterSpacing = css.letterSpacing;
      ctx.textBaseline = "alphabetic";
      let line = "", lineRect;
      const drawLine = () => {
        if (!lineRect) return;
        const metrics = ctx.measureText(line);
        const descent = metrics.fontBoundingBoxDescent ?? parseFloat(css.fontSize) * 0.22;
        ctx.fillText(line, lineRect.left - bounds.left, lineRect.bottom - bounds.top - descent);
      };
      for (let i = 0; i < node.length; i++) {
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const rect = range.getBoundingClientRect();
        if (lineRect && Math.abs(rect.top - lineRect.top) > 1) {
          drawLine();
          line = "";
          lineRect = null;
        }
        lineRect ||= rect;
        line += node.textContent[i];
      }
      drawLine();
    }

    function draw(progress) {
      const cell = steps[Math.min(steps.length - 1, Math.floor(progress * steps.length))] * dpr;
      small.width = Math.max(1, Math.ceil(source.width / cell));
      small.height = Math.max(1, Math.ceil(source.height / cell));
      pixels.drawImage(source, 0, 0, small.width, small.height);
      output.clearRect(0, 0, canvas.width, canvas.height);
      output.imageSmoothingEnabled = false;
      output.globalAlpha = Math.min(1, progress * 3 + 0.15);
      output.drawImage(small, 0, 0, canvas.width, canvas.height);
    }

    draw(0);
    content.appendChild(canvas);
    content.classList.add("is-revealing");
    window.addEventListener("resize", finish, { once: true });
    motion.addEventListener("change", finish, { once: true });
    document.addEventListener("visibilitychange", onVisibility);
    // Always restore the HTML, even if animation frames stop arriving.
    fallback = setTimeout(finish, duration + 500);
    const start = performance.now();
    function tick(now) {
      if (finished) return;
      try {
        const progress = Math.max(0, (now - start) / duration);
        if (progress >= 1) { finish(); return; }
        draw(progress);
        frame = requestAnimationFrame(tick);
      } catch {
        finish();
      }
    }
    frame = requestAnimationFrame(tick);
  }

  // Keep readable HTML as the default when fonts or canvas are unavailable.
  (document.fonts?.ready ?? Promise.resolve()).then(reveal).catch(finish);
})();
