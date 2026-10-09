# Until for BB

A compact watch status row above the message box and an Until panel for pi-until. Cancel stops a watch without success. Complete marks a running recurring goal achieved. These controls call the owning Pi process directly; they do not send agent prompts or start model turns.

The panel shows watch IDs, safe labels (at most 200 characters), lifecycle phase, check and wake counts, missed ticks, timestamps, and the last exit code. It does not show shell conditions, output, task instructions, quick references, or context pointers. “Wake pending” is distinct from an acknowledged “Follow-up running”.

## Install

Both components are required: **the updated Pi extension on the execution host**, and **this BB companion plugin**. A previous pi-until release has no BB socket bridge and will show unavailable.

From this repository, with Node 24.18.0 and npm 11.16.0:

```sh
npm install
npm --prefix bb-plugin-until install
bb plugin build bb-plugin-until
bb plugin install ./bb-plugin-until
```

Install the updated pi-until source through Pi package management, replacing an older source rather than loading two copies. Reload or restart the owning Pi session after that change. The BB plugin does not modify global Pi settings or install the extension for you.

Local BB installs refer to this checkout. Keep it available, or reinstall the plugin from a stable checkout before removing the development environment. The plugin uses BB’s composer-banner slot and experimental host-RPC API, tested with SDK 0.6.31 and BB 0.45.

## Use

The Until row sits above the message box, beside BB’s own status rows rather than in the thread header. It keeps its text on compact/mobile layouts, with a full-width tap target. For example: **Until · 2 active · 1 wake pending**.

Tap the row to open the Until panel, or open Until through the thread-panel actions. The row and panel refresh live state every two seconds while visible. The panel includes active watches and recent finished receipts from the current Pi session.

The row appears only in Pi thread composers with live active watches or error receipts, not new-thread or queued-message editors. Failed, expired, and timed-out watches are counted as **needs attention**. The row disappears after clean completion or cancellation, when the session closes, or when no live snapshot is available; it never leaves an **unavailable** row behind. Polling continues so new live work appears automatically. The Until panel, CLI, and agent tool still explain unavailable connections and never offer stale controls. A hidden row is not proof of successful completion.

- **Cancel:** stop without marking success.
- **Complete:** only for running recurring watches; their goal must be achieved.
- **Refresh:** request the latest live snapshot.
- **Unavailable:** no live answer from the execution host or Pi owner. Cached watches are not shown as live and no controls are offered.

The plugin registers the read-only `bb_until_status` agent tool and imports the `until-bb` skill. Pi agents retain their native `until` tool for creation and control. New agent sessions discover the added guidance.

```sh
bb until list --thread thr_example --json
bb until cancel --thread thr_example <watch-id>
bb until complete --thread thr_example <recurring-watch-id>
```

## Ownership and safety

BB routes each request to the thread environment’s execution host. That host connects to a private Unix socket under `~/.pi/agent/pi-until/bb/`, owned by the live Pi RPC process. Linux and macOS are supported; Windows has no bridge in this version. The directory is owner-only and socket/discovery files are private. Set `PI_UNTIL_BB_BRIDGE=0` before starting Pi to opt out.

Reads require a live socket reply. Controls also carry the process instance from the displayed snapshot, so a stale panel cannot control a replacement process. Requests, responses, connection count, and wait times are bounded. Discovery contains only a version and random socket instance ID. It can remain after shutdown or a crash; it contains no watch state and gives no authority to restore work.

Pi alone owns cadence, gates, follow-up acknowledgement, settlement, compaction holds, expiry, and restoration. A gate permits work but does not complete recurring work. An acknowledgement timeout is uncertain, not rejection. Reload and graceful quit/reopen of the same session restore eligible watches through existing Pi entries. A crash needs the manual `/until-resume` path; new, forked, or replaced sessions restore nothing. BB neither resumes watches nor adds crash or reboot durability.

## Verify

```sh
npm run check
bb plugin build bb-plugin-until
npm run pack:dry
```

Root tests exercise the Pi adapter and real socket. Companion tests exercise host routing, schema validation, UI controls, and loss of the connection through BB’s public testing harnesses. Live BB installation is also required: its source-import boundary is stricter than the standalone build.
