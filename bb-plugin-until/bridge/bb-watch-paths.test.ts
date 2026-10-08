import { basename } from "node:path";

import { expect, it } from "vitest";

import { bbWatchSocketPath, bbWatchThreadKey } from "./bb-watch-paths.ts";

it("hashes thread names into fixed-length socket keys with no path components", () => {
  expect(bbWatchThreadKey("../../outside")).toMatch(/^[a-f0-9]{16}$/u);
  expect(bbWatchThreadKey("thr_one")).not.toBe(bbWatchThreadKey("thr_two"));
  expect(
    basename(
      bbWatchSocketPath("/private/bb", "../../outside", "1234567890abcdef")
    )
  ).toMatch(/^[a-f0-9]{16}-1234567890abcdef\.sock$/u);
});
