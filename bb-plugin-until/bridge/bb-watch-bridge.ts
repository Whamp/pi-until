import { randomBytes } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import type { Socket } from "node:net";
import { join } from "node:path";

import { Value } from "typebox/value";

import { bbWatchSocketPath, bbWatchThreadKey } from "./bb-watch-paths.ts";
import { bbWatchRequestSchema } from "./bb-watch-protocol.ts";
import type { BbWatchRequest, BbWatchState } from "./bb-watch-protocol.ts";

/** BB bridge configuration is local to the session; it does not confer durability. */
export interface BbWatchBridgeOptions {
  readonly threadId: string;
  readonly directory: string;
}

/** A bridge is closed before the watch engine starts session shutdown. */
export interface BbWatchBridge {
  readonly close: () => Promise<void>;
}

interface BbWatchBridgeOwner {
  readonly reportError?: (error: Error) => void;
  readonly snapshot: () => {
    sessionId: string;
    watches: Extract<BbWatchState, { state: "live" }>["watches"];
  };
  readonly control: (
    request: Exclude<BbWatchRequest, { action: "list" }>
  ) => void;
}

function parseBridgeRequest(input: string): BbWatchRequest {
  let decoded: unknown;
  try {
    decoded = JSON.parse(input);
  } catch (error) {
    // Native parse errors quote input; do not return command fragments to BB.
    throw new Error("pi-until BB bridge request is not valid JSON", {
      cause: error,
    });
  }
  if (!Value.Check(bbWatchRequestSchema, decoded)) {
    throw new Error("pi-until BB bridge request is invalid");
  }
  return decoded;
}

/** Serve safe watch state and controls over a private, process-owned Unix socket. */
export async function createBbWatchBridge(
  options: BbWatchBridgeOptions,
  owner: BbWatchBridgeOwner
): Promise<BbWatchBridge> {
  mkdirSync(options.directory, { recursive: true, mode: 0o700 });
  const directoryInfo = lstatSync(options.directory);
  if (
    !directoryInfo.isDirectory() ||
    directoryInfo.isSymbolicLink() ||
    directoryInfo.uid !== process.getuid?.() ||
    directoryInfo.mode % 0o100 !== 0
  ) {
    throw new Error(
      "pi-until BB bridge directory must be private and owned by the current user"
    );
  }
  const instanceId = randomBytes(8).toString("hex");
  const socketPath = bbWatchSocketPath(
    options.directory,
    options.threadId,
    instanceId
  );
  const endpointPath = join(
    options.directory,
    `${bbWatchThreadKey(options.threadId)}.json`
  );
  const temporaryPath = `${endpointPath}.${instanceId}`;
  const connections = new Set<Socket>();
  let closed = false;
  const server = createServer((socket) => {
    connections.add(socket);
    socket.on("close", () => {
      connections.delete(socket);
    });
    socket.on("error", () => {
      socket.destroy();
    });
    socket.setTimeout(2_000, () => {
      socket.destroy();
    });
    let input = "";
    let answered = false;
    socket.setEncoding("utf-8");
    socket.on("data", (chunk: string) => {
      if (answered) {
        return;
      }
      input += chunk;
      if (Buffer.byteLength(input) > 4_096) {
        socket.destroy();
        return;
      }
      if (!input.includes("\n")) {
        return;
      }
      answered = true;
      try {
        const decoded = parseBridgeRequest(input.slice(0, input.indexOf("\n")));
        if (closed) {
          throw new Error("pi-until BB bridge session is closing");
        }
        if (decoded.action !== "list") {
          if (decoded.instanceId !== instanceId) {
            throw new Error(
              "pi-until BB bridge session changed; refresh before using controls"
            );
          }
          owner.control(decoded);
        }
        const state: BbWatchState = {
          state: "live",
          instanceId,
          ...owner.snapshot(),
        };
        socket.end(`${JSON.stringify(state)}\n`);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "pi-until BB bridge request failed";
        socket.end(`${JSON.stringify({ error: message.slice(0, 512) })}\n`);
      }
    });
  });
  server.maxConnections = 16;
  const cleanupFiles = () => {
    rmSync(socketPath, { force: true });
    rmSync(temporaryPath, { force: true });
    // Leave discovery in place: compare-then-unlink races a replacement process.
    // Discovery contains no watch state; only a live socket can answer a read.
  };
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, () => {
        server.off("error", reject);
        resolve();
      });
    });
    server.on("error", (error) => {
      owner.reportError?.(error);
    });
    chmodSync(socketPath, 0o600);
    writeFileSync(temporaryPath, JSON.stringify({ version: 1, instanceId }), {
      mode: 0o600,
      flag: "wx",
    });
    renameSync(temporaryPath, endpointPath);
  } catch (error) {
    server.close();
    cleanupFiles();
    throw error;
  }
  return {
    async close() {
      if (closed) {
        return;
      }
      closed = true;
      for (const socket of connections) {
        socket.destroy();
      }
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
      cleanupFiles();
    },
  };
}
