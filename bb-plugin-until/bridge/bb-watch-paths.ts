import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

/** Private per-user directory shared by Pi and the BB host worker. */
export function bbWatchDirectory(): string {
  return join(homedir(), ".pi", "agent", "pi-until", "bb");
}

/** Hashed thread keys prevent path traversal and keep Unix socket paths short. */
export function bbWatchThreadKey(threadId: string): string {
  return createHash("sha256").update(threadId).digest("hex").slice(0, 16);
}

/** The socket basename is derived from validated discovery, never from a path in input. */
export function bbWatchSocketPath(
  directory: string,
  threadId: string,
  instanceId: string
): string {
  return join(directory, `${bbWatchThreadKey(threadId)}-${instanceId}.sock`);
}
