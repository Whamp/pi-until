import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, it } from "vitest";

import { requestBbWatchState } from "./bb-watch-client.ts";
import { bbWatchThreadKey } from "./bb-watch-paths.ts";

let directory: string;
const THREAD_ID = "thr_client_test";
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "until-client-"));
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

it("does not treat absent or stale discovery as a live session", async () => {
  const options = { directory, threadId: THREAD_ID };
  expect(await requestBbWatchState(options, { action: "list" })).toMatchObject({
    state: "unavailable",
  });
  writeFileSync(
    join(directory, `${bbWatchThreadKey(THREAD_ID)}.json`),
    JSON.stringify({ version: 1, instanceId: "1234567890abcdef" }),
    { mode: 0o600 }
  );
  expect(await requestBbWatchState(options, { action: "list" })).toMatchObject({
    state: "unavailable",
  });
  await expect(
    requestBbWatchState(options, {
      action: "cancel",
      id: "watch",
      instanceId: "instance",
    })
  ).rejects.toThrow();
});

it("rejects public discovery and traversal input instead of following it", async () => {
  const path = join(directory, `${bbWatchThreadKey(THREAD_ID)}.json`);
  const options = { directory, threadId: THREAD_ID };
  writeFileSync(
    path,
    JSON.stringify({ version: 1, instanceId: "../../secret" }),
    { mode: 0o600 }
  );
  await expect(
    requestBbWatchState(options, {
      action: "cancel",
      id: "watch",
      instanceId: "instance",
    })
  ).rejects.toThrow("discovery is invalid");
  chmodSync(path, 0o644);
  await expect(
    requestBbWatchState(options, {
      action: "cancel",
      id: "watch",
      instanceId: "instance",
    })
  ).rejects.toThrow("not private");
});
