(() => {
  const cookieName = "retrac_new_look";
  const isV2 = /^\/home-v2(?:\/|$)/.test(window.location.pathname);

  function redirectHome() {
    const isHome = ["/", "/index.html"].includes(window.location.pathname);
    let enabled = false;
    try {
      enabled = document.cookie.split(";").some(cookie => cookie.trim() === `${cookieName}=1`);
    } catch { /* The toggle still navigates when cookies are blocked. */ }
    if (isHome && enabled) {
      window.location.replace(`/home-v2/${window.location.search}${window.location.hash}`);
    }
  }

  // Run before the homepage paints, and again when restored from the back cache.
  redirectHome();
  window.addEventListener("pageshow", redirectHome);

  document.addEventListener("DOMContentLoaded", () => {
    const toggle = document.getElementById("new-look-toggle");
    if (!toggle) return;
    toggle.setAttribute("aria-checked", String(isV2));
    toggle.hidden = false;
    toggle.addEventListener("click", () => {
      const enabled = !isV2;
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      try {
        document.cookie = `${cookieName}=${enabled ? "1" : "0"}; Path=/; Max-Age=${enabled ? 31536000 : 0}; SameSite=Lax${secure}`;
      } catch { /* Navigation remains available without cookie storage. */ }
      window.location.replace(`${enabled ? "/home-v2/" : "/"}${window.location.search}${window.location.hash}`);
    });
  });
})();
