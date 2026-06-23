# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Fixed
- **Save/Restore Functionality** — Game saves now persist correctly across browser page refreshes
  - Previously, saves were lost on page reload due to inconsistent Bundle URLs
  - Root cause: Fallback to `URL.createObjectURL()` created different Blob URLs each session
  - Solution: Always use consistent `BUNDLE_URL` (`/api/games/{GAME_ID}/bundle`)
  - Saves are keyed by URL, so consistent URL ensures saves are found

- **Cloud Save Authentication Error** — Removed misleading "browser not login" notifications
  - Previously showed when pressing Escape or on certain js-dos events
  - Root cause: js-dos trying to sync saves to cloud storage (which requires auth)
  - Solution: Switched to local-only save using `dosCI.persist()` to IndexedDB
  - Added notification suppression to hide remaining js-dos cloud save messages

### Changed
- **Save Architecture**: Switched from cloud-dependent to local-only saves
  - Saves now use browser IndexedDB exclusively (no server sync needed)
  - No authentication required for save functionality
  - Per-device saves (independent per browser/device)
  
- **Player Initialization**:
  - `actionPickLocalFile()` now always uses `BUNDLE_URL` instead of Blob URL fallback
  - `actionDownloadFromServer()` now always uses `BUNDLE_URL` instead of Blob URL fallback
  - Ensures consistent game/save identification across sessions

- **Save Button Behavior**:
  - `saveGame()` now uses `dosCI.persist()` (local IndexedDB sync)
  - Removed `dosProps.save()` which was attempting cloud sync
  - Suppresses js-dos cloud save notifications automatically

### Technical Details

#### Before
```javascript
// Created different URL every session
const url = cached ? BUNDLE_URL : URL.createObjectURL(file);
// Tried to use cloud save (auth error)
const saveResult = await dosProps.save();
```

#### After
```javascript
// Always consistent
await createDosPlayer(BUNDLE_URL);
// Local-only save
const changes = await dosCI.persist();
```

### Files Modified
- `web/static/js/game.js`
  - Line 447-463: `actionPickLocalFile()` — removed Blob URL fallback
  - Line 465-484: `actionDownloadFromServer()` — removed Blob URL fallback
  - Line 558-611: `setupControls()` & `suppressCloudSaveNotifications()` — added notification suppression
  - Line 597-628: `saveGame()` — switched to local-only persist()

### Documentation Updated
- `web/README.md`
  - Updated save architecture description (local-only)
  - Updated feature list (local saves instead of cloud saves)
  - Updated js-dos API mapping (removed cloud save references)
  - Added "Key Points" section explaining save behavior
  - Improved save/load flow documentation

- `web/static/js/game.js`
  - Enhanced file header comments with detailed architecture explanation

### Testing Recommendations
1. Start a game and make progress
2. Click "💾 Save" button — should show "已保存 ✅"
3. Refresh the browser
4. Game should auto-load with previous progress restored
5. No "browser not login" error should appear

### Notes
- Saves are browser-local only, not synced across devices
- IndexedDB availability is required (works in all modern browsers)
- Cache API is still used when available for faster bundle loading
- Fallback to Flask endpoint when Cache API is unavailable
