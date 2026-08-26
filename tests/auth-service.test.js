import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AuthService, SESSION_MAX_AGE_SECONDS } from "../backend/services/auth-service.js";

test("validates only the configured account and persists its signing secret", async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "lovesuki-auth-"));
  try {
    const service = new AuthService(dataDirectory);
    await service.initialize();

    assert.equal(service.verifyCredentials("noart", "wrong-password"), false);
    assert.equal(service.verifyCredentials("another-user", "another-password"), false);

    const secret = await readFile(path.join(dataDirectory, ".session-secret"));
    assert.ok(secret.length >= 32);
  } finally {
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("creates signed sessions that expire after 30 days", async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "lovesuki-session-"));
  let currentTime = Date.UTC(2026, 7, 26, 12, 0, 0);
  try {
    const service = new AuthService(dataDirectory, { now: () => currentTime });
    await service.initialize();
    const token = service.createSessionToken();
    const session = service.verifySessionToken(token);

    assert.equal(session.username, "noart");
    assert.equal(session.expiresAt, Math.floor(currentTime / 1000) + SESSION_MAX_AGE_SECONDS);
    assert.equal(service.verifySessionToken(`${token}changed`), null);

    currentTime += (SESSION_MAX_AGE_SECONDS + 1) * 1000;
    assert.equal(service.verifySessionToken(token), null);
  } finally {
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
