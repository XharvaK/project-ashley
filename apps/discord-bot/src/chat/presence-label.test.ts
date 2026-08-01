import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  pickPresenceLabel,
  shouldApplyPresence,
  snipTitle,
} from "./presence-label.js";

describe("snipTitle", () => {
  it("strips site suffixes and truncates", () => {
    assert.equal(snipTitle("Hello World - Example.com"), "Hello World");
    const long = "a".repeat(50);
    assert.ok(snipTitle(long).endsWith("…"));
    assert.ok([...snipTitle(long)].length <= 37);
  });
});

describe("pickPresenceLabel", () => {
  it("prefers brain offline", () => {
    const pick = pickPresenceLabel({
      healthy: false,
      enabled: true,
      takesToday: 3,
      presence: null,
    });
    assert.equal(pick.label, "brain offline");
    assert.equal(pick.discordStatus, "idle");
  });

  it("never emits a raw count", () => {
    const pick = pickPresenceLabel({
      healthy: true,
      enabled: true,
      takesToday: 4,
      presence: {
        ownTime: false,
        proactivePaused: false,
        curiosityEnabled: true,
        owing: null,
        lastTake: {
          title: "Solid State Batteries Explained",
          depth: "full",
          createdAt: "2026-08-01T01:00:00Z",
          ageMin: 30,
        },
      },
    });
    assert.match(pick.label, /^reading /);
    assert.doesNotMatch(pick.label, /\d+/);
  });

  it("uses skimmed for excerpt depth", () => {
    const pick = pickPresenceLabel({
      healthy: true,
      enabled: true,
      takesToday: 1,
      presence: {
        ownTime: false,
        proactivePaused: false,
        curiosityEnabled: true,
        owing: null,
        lastTake: {
          title: "Feed blurb",
          depth: "excerpt",
          createdAt: "2026-08-01T01:00:00Z",
          ageMin: 10,
        },
      },
    });
    assert.match(pick.label, /^skimmed /);
  });

  it("shows feed quiet when curiosity on and no takes", () => {
    const pick = pickPresenceLabel({
      healthy: true,
      enabled: true,
      takesToday: 0,
      presence: {
        ownTime: false,
        proactivePaused: false,
        curiosityEnabled: true,
        owing: null,
        lastTake: null,
      },
    });
    assert.equal(pick.label, "feed quiet");
  });
});

describe("shouldApplyPresence", () => {
  it("applies stronger priority immediately", () => {
    const sticky = {
      priority: 5,
      contentKey: "p5:quiet",
      appliedAt: Date.now(),
    };
    const offline = pickPresenceLabel({
      healthy: false,
      enabled: true,
      takesToday: 0,
      presence: null,
    });
    assert.equal(shouldApplyPresence(sticky, offline), true);
  });

  it("blocks same-key refresh", () => {
    const pick = pickPresenceLabel({
      healthy: true,
      enabled: true,
      takesToday: 0,
      presence: {
        ownTime: false,
        proactivePaused: false,
        curiosityEnabled: true,
        owing: null,
        lastTake: null,
      },
    });
    const sticky = {
      priority: pick.priority,
      contentKey: pick.contentKey,
      appliedAt: Date.now(),
    };
    assert.equal(shouldApplyPresence(sticky, pick), false);
  });
});
