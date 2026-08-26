import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ACCOUNT_USERNAME = "noart";
const PASSWORD_SALT = "LoveSuki::single-user::2026";
const PASSWORD_HASH = Buffer.from(
  "86e23a98718b6fbbd84e0973e477338de1aaee86a1c17c8429743f9cbf01f250de86e8386ca64e0c49cda1af48ee4537c4dfe8f1557ac1016b74265ba1035fe0",
  "hex"
);
const USERNAME_HASH = createHash("sha256").update(ACCOUNT_USERNAME).digest();
const SESSION_COOKIE_NAME = "lovesuki_session";
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function parseCookies(header = "") {
  const cookies = new Map();
  for (const part of String(header).split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    cookies.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
  }
  return cookies;
}

function isSecureRequest(request) {
  const forwardedProtocol = String(request.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  return forwardedProtocol === "https" || Boolean(request.socket?.encrypted);
}

function createCookie(value, { maximumAge, secure = false } = {}) {
  const attributes = [
    `${SESSION_COOKIE_NAME}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maximumAge}`
  ];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

export class AuthService {
  constructor(dataDirectory, { now = () => Date.now() } = {}) {
    this.secretPath = path.join(dataDirectory, ".session-secret");
    this.now = now;
    this.secret = null;
  }

  async initialize() {
    await mkdir(path.dirname(this.secretPath), { recursive: true });

    try {
      this.secret = await readFile(this.secretPath);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const generatedSecret = randomBytes(48);
      try {
        await writeFile(this.secretPath, generatedSecret, { flag: "wx", mode: 0o600 });
        this.secret = generatedSecret;
      } catch (writeError) {
        if (writeError?.code !== "EEXIST") throw writeError;
        this.secret = await readFile(this.secretPath);
      }
    }

    if (!this.secret || this.secret.length < 32) {
      throw new Error("Session secret must contain at least 32 bytes.");
    }
  }

  verifyCredentials(username, password) {
    const suppliedUsernameHash = createHash("sha256")
      .update(typeof username === "string" ? username.trim() : "")
      .digest();
    const suppliedPasswordHash = scryptSync(
      typeof password === "string" && password.length <= 256 ? password : "",
      PASSWORD_SALT,
      PASSWORD_HASH.length
    );

    return timingSafeEqual(suppliedUsernameHash, USERNAME_HASH)
      && timingSafeEqual(suppliedPasswordHash, PASSWORD_HASH);
  }

  createSessionToken() {
    this.#requireInitialized();
    const expiresAt = Math.floor(this.now() / 1000) + SESSION_MAX_AGE_SECONDS;
    const payload = Buffer.from(JSON.stringify({ username: ACCOUNT_USERNAME, expiresAt }))
      .toString("base64url");
    const signature = createHmac("sha256", this.secret).update(payload).digest("base64url");
    return `${payload}.${signature}`;
  }

  verifySessionToken(token) {
    this.#requireInitialized();
    if (typeof token !== "string" || token.length > 1024) return null;
    const [payload, suppliedSignature, extraPart] = token.split(".");
    if (!payload || !suppliedSignature || extraPart !== undefined) return null;

    const expectedSignature = createHmac("sha256", this.secret).update(payload).digest();
    let signature;
    try {
      signature = Buffer.from(suppliedSignature, "base64url");
    } catch {
      return null;
    }
    if (signature.length !== expectedSignature.length || !timingSafeEqual(signature, expectedSignature)) {
      return null;
    }

    try {
      const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      const nowInSeconds = Math.floor(this.now() / 1000);
      if (session.username !== ACCOUNT_USERNAME || !Number.isInteger(session.expiresAt)) return null;
      if (session.expiresAt <= nowInSeconds) return null;
      return { username: session.username, expiresAt: session.expiresAt };
    } catch {
      return null;
    }
  }

  getSession(request) {
    const token = parseCookies(request.headers.cookie).get(SESSION_COOKIE_NAME);
    return this.verifySessionToken(token);
  }

  isAuthenticated(request) {
    return Boolean(this.getSession(request));
  }

  createSessionCookie(request) {
    return createCookie(this.createSessionToken(), {
      maximumAge: SESSION_MAX_AGE_SECONDS,
      secure: isSecureRequest(request)
    });
  }

  createExpiredCookie(request) {
    return createCookie("", { maximumAge: 0, secure: isSecureRequest(request) });
  }

  #requireInitialized() {
    if (!this.secret) throw new Error("AuthService has not been initialized.");
  }
}
