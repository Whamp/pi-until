import { expect, it } from "vitest";

import { watchRpcContract } from "./watch-contract.ts";

it("the public RPC contract excludes arbitrary shell commands and requires a process instance for controls", () => {
  expect(
    watchRpcContract.watches.input.safeParse({
      threadId: "thr_test",
      request: { action: "list" },
    }).success
  ).toBe(true);
  expect(
    watchRpcContract.watches.input.safeParse({
      threadId: "thr_test",
      request: { action: "start", condition: "false" },
    }).success
  ).toBe(false);
  expect(
    watchRpcContract.watches.input.safeParse({
      threadId: "thr_test",
      request: { action: "cancel", id: "watch" },
    }).success
  ).toBe(false);
});
