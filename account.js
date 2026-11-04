(() => {
  const account = document.getElementById("account");
  if (!account) return;
  let checking = false;

  function render(label, username, unavailable = false) {
    const link = document.createElement("a");
    link.href = "https://accounts.retrac.space";
    link.textContent = label;
    if (unavailable) link.title = "Unable to check account status. Visit your account to continue.";
    account.replaceChildren();
    if (username) {
      const greeting = document.createElement("span");
      greeting.className = "account-greeting";
      greeting.textContent = `Hey there, ${username}`;
      greeting.title = greeting.textContent;
      const separator = document.createElement("span");
      separator.textContent = "|";
      separator.setAttribute("aria-hidden", "true");
      account.append(greeting, separator);
    }
    account.append(link);
    account.setAttribute("aria-busy", "false");
  }

  async function checkSession() {
    if (checking) return;
    checking = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      // Send host-only cookies to their own host; never read or copy them here.
      // The accounts service must explicitly allow credentialed CORS for this site.
      const response = await fetch("https://accounts.retrac.space/api/auth/get-session", {
        credentials: "include",
        mode: "cors",
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Session unavailable");
      const data = await response.json();
      if (data === null) {
        render("Sign in");
      } else if (data?.session && data?.user) {
        // Some accounts may still need to choose a username on the account site.
        const username = typeof data.user.username === "string" ? data.user.username : "";
        render("Manage my account", username);
      } else {
        throw new Error("Unexpected session response");
      }
    } catch {
      // A failed check is not evidence that the visitor is signed out.
      render("Manage my account", "", true);
    } finally {
      clearTimeout(timeout);
      checking = false;
    }
  }

  checkSession();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) checkSession();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) checkSession();
  });
})();
