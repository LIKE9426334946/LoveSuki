const form = document.querySelector("#loginForm");
const usernameInput = document.querySelector("#username");
const passwordInput = document.querySelector("#password");
const message = document.querySelector("#loginMessage");
const button = document.querySelector("#loginButton");

function getNextPath() {
  const requested = new URLSearchParams(window.location.search).get("next");
  return requested === "/admin" || requested === "/admin/" ? "/admin" : "/";
}

async function checkExistingSession() {
  try {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    const data = await response.json();
    if (data.authenticated) window.location.replace(getNextPath());
  } catch {
    // The form remains available when the session check cannot be completed.
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";
  button.disabled = true;
  button.textContent = "正在登录…";

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: usernameInput.value,
        password: passwordInput.value
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "登录失败，请稍后重试。");
    window.location.replace(getNextPath());
  } catch (error) {
    message.textContent = error.message;
    passwordInput.select();
    button.disabled = false;
    button.textContent = "登录";
  }
});

checkExistingSession();
