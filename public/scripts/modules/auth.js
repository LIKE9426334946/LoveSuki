function currentPagePath() {
  return window.location.pathname.startsWith("/admin") ? "/admin" : "/";
}

export function redirectToLogin() {
  const next = encodeURIComponent(currentPagePath());
  window.location.replace(`/login?next=${next}`);
}

export function handleUnauthorized(response) {
  if (response.status !== 401) return false;
  redirectToLogin();
  return true;
}

export function setupLogout(button, { beforeLogout = () => true } = {}) {
  button.addEventListener("click", async () => {
    if (!beforeLogout()) return;
    button.disabled = true;
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.replace("/login");
    }
  });
}
