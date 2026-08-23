import test from "node:test";
import assert from "node:assert/strict";
import {
  getPetFramePosition,
  PET_ACTIONS,
  PET_AMBIENT_ACTIONS,
  PET_INTERACTION_ACTIONS
} from "../public/scripts/modules/desktop-pet.js";

test("maps all sprite-sheet action rows", () => {
  const actions = Object.values(PET_ACTIONS);
  assert.equal(actions.length, 11);
  assert.equal(actions.reduce((total, action) => total + action.frames, 0), 73);
  assert.equal(new Set(actions.map((action) => action.rowY)).size, 11);
});

test("exposes varied ambient and click interactions", () => {
  assert.ok(PET_AMBIENT_ACTIONS.length >= 8);
  assert.ok(PET_INTERACTION_ACTIONS.length >= 8);
  assert.ok(PET_AMBIENT_ACTIONS.includes("run"));
  assert.ok(PET_INTERACTION_ACTIONS.includes("wave"));
});

test("calculates sprite frame positions without exposing adjacent frames", () => {
  assert.deepEqual(getPetFramePosition("wave", 0), { x: 0, y: -413 });
  assert.deepEqual(getPetFramePosition("wave", 3), { x: -387, y: -413 });
  assert.deepEqual(getPetFramePosition("wave", 4), { x: 0, y: -413 });
  assert.throws(() => getPetFramePosition("missing", 0), /Unknown pet action/);
});
