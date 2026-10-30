// The URL can enable reduced motion for testing, but never disable the OS setting.
const motionSettings = (() => {
  const forced = new URLSearchParams(window.location.search).get("reduce_motion") === "true";
  const preference = matchMedia("(prefers-reduced-motion: reduce)");
  if (forced) document.documentElement.setAttribute("data-reduce-motion", "true");
  return {
    get matches() { return forced || preference.matches; },
    addEventListener(...args) { preference.addEventListener(...args); },
    removeEventListener(...args) { preference.removeEventListener(...args); },
  };
})();
