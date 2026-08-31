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
    assert.doesNotMatch(home, /desktopPet|petToggleButton|desktop-pet/);
    assert.match(home, /viewport-fit=cover/);
    assert.match(home, /id="mobileLibraryButton"/);
    assert.match(home, /id="libraryBackdrop"/);
    assert.doesNotMatch(home, /newDirectoryButton|textInput|saveButton/);
    assert.doesNotMatch(home, /把想说的话，慢慢写下来|已连接/);

    const adminResponse = await fetch(`${baseUrl}/admin`);
    const admin = await adminResponse.text();
    assert.equal(adminResponse.status, 200);
    assert.match(admin, /scripts\/admin\.js/);
    assert.match(admin, /newDirectoryButton/);
    assert.match(admin, /textInput/);
    assert.doesNotMatch(admin, /id="desktopPet"/);

    const stylesResponse = await fetch(`${baseUrl}/styles/main.css`);
    const styles = await stylesResponse.text();
    assert.equal(stylesResponse.status, 200);
    assert.match(styles, /\.viewer-page\.library-open \.viewer-library-panel/);
    assert.match(styles, /env\(safe-area-inset-bottom\)/);
    assert.match(styles, /\.display-panel\.is-focus-mode/);
    assert.match(styles, /data-playback-state="ready"/);
    assert.doesNotMatch(styles, /desktop-pet|pet-spritesheet/);

    const viewerModuleResponse = await fetch(`${baseUrl}/scripts/viewer.js`);
    const viewerModule = await viewerModuleResponse.text();
    assert.equal(viewerModuleResponse.status, 200);
    assert.match(viewerModule, /setLibraryOpen/);
    assert.match(viewerModule, /matchMedia\("\(max-width: 720px\)"\)/);
    assert.doesNotMatch(viewerModule, /createDesktopPet|petToggleButton/);
  });
});
