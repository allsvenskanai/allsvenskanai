[static-inventory.md](https://github.com/user-attachments/files/26728323/static-inventory.md)
# Static JSON inventory

Generated during Fas 3 safety review.

## Summary

`data/static` currently contains 3153 JSON files:

- `players-*`: 2605 files
- `transfers-*`: 248 files
- `teams-*`: 154 files
- `fixtures-*`: 136 files
- `standings-*`: 9 files
- `manifest.json`: 1 file

## Classification

### Still used by new system

None confirmed.

The new production shell reads:

- `/api/football` for standings, fixtures and light match/team data
- `/api/stats` for public persisted statistics snapshots
- `/api/admin?action=public-transfers` for public persisted transfer snapshots

No new `src/` module reads `/data/static`.

### Legacy but useful as backup

All current `data/static/*.json` files.

They are API-Football shaped legacy data, visible from `manifest.json` query keys such as:

- `standings?league=113&season=2026`
- `players?league=113&season=2026&team=...`
- `fixtures?league=113&season=2026&team=...`
- `transfers?team=...`

These files may still be useful for rollback/debugging, so they were not deleted.

### Safe to delete later

Potentially all `data/static/*.json`, but only after:

1. new production has been verified live,
2. rollback is no longer expected to rely on old static fallback,
3. the owner explicitly approves deletion or archival,
4. files are moved to `data/static_backup` before permanent deletion.

## Current protection

`.vercelignore` excludes `data/static/*.json`, so legacy static JSON is not intended to deploy with the new production build.
