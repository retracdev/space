(() => {
  const motion = motionSettings;
  const stage = document.getElementById('stage');
  const plane = document.getElementById('wordmark-plane');
  const letters = document.getElementById('letters');
  const notice = document.getElementById('notice');
  let noticeTimer;
  let falling = false;
  let animations = [];

  function announce(message) {
    notice.textContent = message;
    notice.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice.hidden = true; }, 4000);
  }

  // Real buttons preserve the logo's keyboard and touch Easter egg.
  const buttons = Array.from('retrac.space', (char, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = char;
    button.className = `letter${index >= 6 ? ' suffix' : ''}`;
    button.setAttribute('aria-label', `Animate title: ${char}`);
    button.addEventListener('click', () => tumble(index));
    return button;
  });
  letters.replaceChildren(...buttons);
  letters.removeAttribute('aria-hidden');

  async function tumble(origin) {
    if (motion.matches) {
      announce('Gravity is taking a break. Reduced motion is on.');
      return;
    }
    if (falling || !buttons[0].animate) return;
    falling = true;
    animations = buttons.map((button, index) => {
      const direction = index < origin ? -1 : 1;
      return button.animate([
        { transform: 'translate3d(0,0,0) rotate(0)', opacity: 1, offset: 0 },
        { transform: `translate3d(${direction * 12}px,-35px,50px) rotate(${direction * 12}deg)`, opacity: 1, offset: .15 },
        { transform: `translate3d(${direction * (35 + index * 4)}px,260px,90px) rotate(${direction * 100}deg)`, opacity: 0, offset: .58 },
        { transform: 'translate3d(0,-18px,0) rotate(0)', opacity: 0, offset: .74 },
        { transform: 'translate3d(0,0,0) rotate(0)', opacity: 1, offset: 1 },
      ], { duration: 2000, delay: Math.abs(index - origin) * 55, easing: 'cubic-bezier(.4,0,.3,1)' });
    });
    await Promise.allSettled(animations.map(animation => animation.finished));
    animations = [];
    falling = false;
  }

  stage.addEventListener('pointermove', event => {
    if (motion.matches || falling || event.pointerType !== 'mouse') return;
    const rect = stage.getBoundingClientRect();
    plane.style.setProperty('--rx', `${10 - (event.clientY - rect.top - rect.height / 2) / rect.height * 8}deg`);
    plane.style.setProperty('--ry', `${-12 + (event.clientX - rect.left - rect.width / 2) / rect.width * 12}deg`);
  });
  function resetStage() { plane.style.removeProperty('--rx'); plane.style.removeProperty('--ry'); }
  stage.addEventListener('pointerleave', resetStage);
  stage.addEventListener('pointercancel', resetStage);

  const cards = [...document.querySelectorAll('.project-card')];
  function resetCard(card) { card.style.removeProperty('--card-rx'); card.style.removeProperty('--card-ry'); }
  cards.forEach(card => {
    card.addEventListener('pointermove', event => {
      if (motion.matches || event.pointerType !== 'mouse' || !matchMedia('(min-width: 651px)').matches) return;
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--card-rx', `${-(event.clientY - rect.top - rect.height / 2) / rect.height * 12}deg`);
      card.style.setProperty('--card-ry', `${(event.clientX - rect.left - rect.width / 2) / rect.width * 12}deg`);
    });
    card.addEventListener('pointerleave', () => resetCard(card));
    card.addEventListener('pointercancel', () => resetCard(card));
  });

  // Video is still by default; only an intentional hover/focus plays a preview.
  // This avoids continuous motion and keeps decoding limited to one project.
  const previews = [...document.querySelectorAll('video')].map(video => {
    const link = video.closest('a');
    const state = { video, link, hovered: false, focused: false };
    video.addEventListener('loadeddata', () => video.classList.add('is-ready'));
    video.addEventListener('error', () => video.classList.remove('is-ready'));
    link.addEventListener('pointerenter', event => { state.hovered = event.pointerType === 'mouse'; syncVideos(); });
    link.addEventListener('pointerleave', () => { state.hovered = false; syncVideos(); });
    link.addEventListener('pointercancel', () => { state.hovered = false; syncVideos(); });
    link.addEventListener('focusin', () => { state.focused = true; syncVideos(); });
    link.addEventListener('focusout', () => { state.focused = false; syncVideos(); });
    return state;
  });
  function syncVideos() {
    for (const { video, hovered, focused } of previews) {
      if (!motion.matches && !document.hidden && (hovered || focused)) video.play().catch(() => {});
      else video.pause();
    }
  }

  // A familiar cheat code opens a second orbit. No sound or surprise navigation.
  const code = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  let progress = 0;
  document.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.repeat || event.target.closest('input, textarea, select, [contenteditable]')) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    progress = key === code[progress] ? progress + 1 : (key === code[0] ? 1 : 0);
    if (progress === code.length) {
      progress = 0;
      const active = document.body.classList.toggle('warp');
      announce(active ? 'Secret orbit discovered. Welcome, space traveler.' : 'Back in familiar orbit.');
      if (active && !motion.matches) tumble(5);
    }
  });

  function settle() {
    animations.forEach(animation => animation.cancel());
    resetStage();
    cards.forEach(resetCard);
    syncVideos();
  }
  motion.addEventListener('change', settle);
  window.addEventListener('resize', settle);
  window.addEventListener('blur', () => {
    previews.forEach(state => { state.hovered = false; state.focused = false; });
    settle();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) settle();
    else syncVideos();
  });
})();
