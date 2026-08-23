import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createStaticHandler } from "../backend/static-handler.js";

async function withStaticServer(run) {
  const handler = createStaticHandler();
  const server = createServer((request, response) => handler(request, response));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("serves a display-only home page and a separate admin route", async () => {
  await withStaticServer(async (baseUrl) => {
    const homeResponse = await fetch(`${baseUrl}/`);
    const home = await homeResponse.text();
    assert.equal(homeResponse.status, 200);
    assert.match(home, /scripts\/viewer\.js/);
    assert.match(home, /id="desktopPet"/);
    assert.doesNotMatch(home, /newDirectoryButton|textInput|saveButton/);
    assert.doesNotMatch(home, /把想说的话，慢慢写下来|已连接/);

    const adminResponse = await fetch(`${baseUrl}/admin`);
    const admin = await adminResponse.text();
    assert.equal(adminResponse.status, 200);
    assert.match(admin, /scripts\/admin\.js/);
    assert.match(admin, /newDirectoryButton/);
    assert.match(admin, /textInput/);
    assert.doesNotMatch(admin, /id="desktopPet"/);

    const petResponse = await fetch(`${baseUrl}/assets/pet-spritesheet.png`, { method: "HEAD" });
    assert.equal(petResponse.status, 200);
    assert.equal(petResponse.headers.get("content-type"), "image/png");

    const petModuleResponse = await fetch(`${baseUrl}/scripts/modules/desktop-pet.js`);
    const petModule = await petModuleResponse.text();
    assert.equal(petModuleResponse.status, 200);
    assert.match(petModule, /runRight|turnLeft|PET_AMBIENT_ACTIONS/);
  });
});
