# Cartographer — Atomic Persistence

**Date:** 2026-06-25
**Status:** Approved (design), pending implementation
**Author:** Claude (with Alexander Hamilton)

## Problem

`WorldModelStore.persistToDisk()` writes the full model with a single
`fs.writeFileSync(persistPath, ...)`. That is **not atomic**: a crash (`kill -9`,
power loss) or a concurrent writer mid-write can leave a **truncated/corrupt
`model.json`**. The store's own comment acknowledges the hazard
(*"data loss from kill -9 is worse than a small write cost"*), and `loadFromDisk`
only recovers *after* corruption (backs up the bad file, starts empty).

This is the write-safety slice of the broader multi-instance question. The
*logical* multi-writer race (two sessions' in-memory stores diverging,
last-writer-wins on the file) is **deliberately deferred** as YAGNI for a
solo-dev tool where concurrent same-project sessions are rare — it stays
documented (task #13) and warned about at startup. This spec covers only the
clean, zero-downside write-safety fix.

## Goal

`model.json` is never observed truncated/corrupt. A reader (this process on
reload, another instance, or a person) always sees either the complete previous
file or the complete new file — never a partial one.

### Non-goals

- Cross-session live consistency / eliminating the logical last-writer-wins race
  (separate, deferred — task #13).
- Changing the synchronous-write-on-every-change persistence model.

## Design

Replace the in-place write with **write-temp-then-rename**:

1. Serialize the snapshot to a string.
2. Write it to a temp file in the **same directory** (`{persistPath}.tmp.{pid}` —
   same filesystem so `rename` is atomic; pid-scoped so two instances don't share
   a temp file).
3. `fs.renameSync(tmp, persistPath)` — atomic replace on POSIX.
4. On any failure, best-effort `unlink` the temp file and rethrow (surfacing a
   real error like disk-full, same as today's `writeFileSync` throw — no new
   silent-failure path).

This is a single-method change in `persistToDisk()`. No interface change, no new
dependencies, no effect on callers (`markDirty`, `shutdown`, `saveSnapshot`).

## Error handling

`writeFileSync(tmp)` / `renameSync` can throw (disk full, permissions). We clean
up the temp file and rethrow — identical surfacing to the current code, which
already lets `writeFileSync` throw up to the MCP tool handler.

## Testing

- **Unit (GREEN safety check):** after a write, `model.json` parses and contains
  the written entity, and **no `.tmp` file is left behind**. (True crash-atomicity
  can't be unit-tested without killing mid-write; the temp+rename construction is
  the guarantee.) Added to `scripts/verify/assert-unit.mjs`.
- **Regression:** the full harness (6 scripted suites + Playwright) must stay
  green — persistence underlies every layer, so any breakage shows up there.

## Out of scope / follow-on

The logical multi-writer race (task #13) — revisit with a shared-server design
only if real concurrent multi-session use emerges.
