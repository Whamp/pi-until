import { Value } from "typebox/value";
import { expect, it } from "vitest";

import {
  bbWatchRequestSchema,
  bbWatchStateSchema,
} from "./bb-watch-protocol.ts";

it("requires a process instance for controls and rejects extra capabilities", () => {
  expect(Value.Check(bbWatchRequestSchema, { action: "list" })).toBe(true);
  expect(
    Value.Check(bbWatchRequestSchema, { action: "cancel", id: "watch" })
  ).toBe(false);
  expect(
    Value.Check(bbWatchRequestSchema, { action: "start", condition: "false" })
  ).toBe(false);
  expect(
    Value.Check(bbWatchRequestSchema, { action: "list", command: "secret" })
  ).toBe(false);
});

it("rejects cached-looking live state and secret fields at the display boundary", () => {
  expect(Value.Check(bbWatchStateSchema, { state: "live", watches: [] })).toBe(
    false
  );
  expect(
    Value.Check(bbWatchStateSchema, {
      state: "live",
      sessionId: "session",
      instanceId: "instance",
      watches: [],
      instruction: "private",
    })
  ).toBe(false);
  expect(
    Value.Check(bbWatchStateSchema, {
      state: "unavailable",
      reason: "Session stopped",
    })
  ).toBe(true);
});
