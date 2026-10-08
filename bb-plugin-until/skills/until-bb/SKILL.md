---
name: until-bb
description: Inspect pi-until watches in BB, explain the Until indicator and panel, and distinguish unavailable sessions from live watch results.
---

# Until in BB

Pi thread composers have a compact Until status row above the message box. It shows active watches, pending wakes, and watches that need attention, with readable text on mobile. Tap it to open the Until thread panel. Live sessions with no active or error watches hide the row. A lost connection shows unavailable rather than cached counts. The panel reads the owning Pi process on its execution host; BB does not run checks or schedule wakes.

- Use `bb_until_status` to read live state. It defaults to this BB thread and accepts an optional `threadId`.
- Pi agents use the native `until` tool to start, repeat, list, inspect, cancel, or complete watches.
- The panel has Cancel and Complete controls. Complete is only for a running recurring watch and means its goal was achieved. Cancel stops without success. Neither action starts a model turn.
- A successful gate permits work; it does not complete recurring work. “Wake pending” is not acknowledgement. “Follow-up running” means Pi acknowledged the message, not that the work finished. An acknowledgement timeout is uncertain, not rejected.
- Unavailable means the host or owning Pi process could not answer. Do not treat cached watches as live, infer success, restart the task, or create a replacement watch.
- If the updated extension is not loaded, install that version on the execution host and reload or restart the owning Pi session. Keep only one pi-until installation source. Do not edit global Pi configuration without authorization.
- Reload and graceful quit followed by reopening the same session restore eligible watches automatically. A crash restores nothing automatically; `/until-resume` is the manual path. Session replacement, a new session, a fork, or reboot adds no restoration guarantee.
- Commands, check output, recurring instructions, quick references, and context pointers are not in the BB display data. Do not fetch private packets merely to explain the panel.

For operator checks, `bb until list --thread <thread-id> --json` reads the same live state. The BB plugin never creates or resumes watches.
