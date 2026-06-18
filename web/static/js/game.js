/**
 * Chinese DOS Games — js-dos v8 Game Player
 *
 * Uses js-dos v8 with DOSBox-X backend for Chinese character support.
 * v8 API: Dos(element, { url, backend, ... }) returns DosProps.
 *
 * Save/Load: js-dos v8 persists filesystem changes to IndexedDB (Emscripten
 * IDBFS).  We export that IndexedDB data after save(), upload it to the
 * server, and reverse the process on load.
 */
(function () {
    'use strict';

    let dosProps = null;       // DosProps from Dos()
    let dosCI = null;          // CommandInterface (from ci-ready event)
    let isPaused = false;
    let isFullscreen = false;
    let volume = 1.0;
    let saveDbNames = null;    // Cached list of IndexedDB names used by js-dos

    const GAME_ID = window.GAME_ID;
    const BUNDLE_URL = `/api/games/${encodeURIComponent(GAME_ID)}/bundle`;

    const LOADING_HTML = `
        <div class="loading-spinner"></div>
        <p class="loading-text">正在加载游戏...</p>
    `;

    // ═══════════════════════════════════════════════════════════════
    //  Player creation
    // ═══════════════════════════════════════════════════════════════

    function createDosPlayer() {
        const container = document.getElementById('dos-container');
        const saveStatus = document.getElementById('save-status');

        if (!container) {
            console.error('[game.js] #dos-container not found');
            return Promise.reject(new Error('页面元素缺失'));
        }

        // Clear container and re-add loading overlay
        container.innerHTML = '';
        const loadingEl = document.createElement('div');
        loadingEl.className = 'game-loading';
        loadingEl.id = 'game-loading';
        loadingEl.innerHTML = LOADING_HTML;
        container.appendChild(loadingEl);

        console.log('[game.js] Creating Dos player, url:', BUNDLE_URL);

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                console.error('[game.js] Dos() ci-ready timeout — game did not start');
                reject(new Error('游戏加载超时，请检查网络连接'));
            }, 60000); // 60-second timeout

            try {
                dosProps = Dos(container, {
                    url: BUNDLE_URL,
                    backend: 'dosboxX',
                    volume: volume,
                    autoStart: true,
                    onEvent: (event, ci) => {
                        console.log('[game.js] Dos event:', event);
                        if (event === 'ci-ready') {
                            clearTimeout(timeout);
                            dosCI = ci;
                            const le = document.getElementById('game-loading');
                            if (le) le.classList.add('hidden');
                            if (saveStatus) saveStatus.textContent = '游戏已就绪';
                            console.log('[game.js] Game ready — ci-ready received');
                            resolve(ci);
                        } else if (event === 'fullscreen-changed') {
                            isFullscreen = !!ci;
                            updateFullscreenButton();
                        }
                    },
                });
                console.log('[game.js] Dos() returned:', dosProps);
            } catch (err) {
                clearTimeout(timeout);
                console.error('[game.js] Dos() threw synchronously:', err);
                reject(err);
            }
        });
    }

    // ═══════════════════════════════════════════════════════════════
    //  Startup
    // ═══════════════════════════════════════════════════════════════

    document.addEventListener('DOMContentLoaded', async () => {
        const container = document.getElementById('dos-container');

        if (!container || !GAME_ID) return;

        if (typeof window.DOS !== 'undefined' && window.DOS.App && window.DOS.App.isLoggedIn()) {
            checkExistingSave();
        }

        try {
            await createDosPlayer();
        } catch (err) {
            console.error('[game.js] Startup failed:', err);
            const le = document.getElementById('game-loading');
            if (le) {
                le.innerHTML = `
                    <p style="color:var(--danger);font-size:1rem;">❌ 加载失败</p>
                    <p style="color:var(--text-muted);">${err.message || '未知错误'}</p>
                    <button class="btn btn-primary" onclick="location.reload()">重试</button>
                `;
                le.classList.remove('hidden');
            }
        }

        setupControls();
        loadMetadata();
    });

    // ═══════════════════════════════════════════════════════════════
    //  Controls
    // ═══════════════════════════════════════════════════════════════

    function setupControls() {
        document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);
        document.getElementById('btn-pause').addEventListener('click', togglePause);
        document.getElementById('btn-restart').addEventListener('click', restartGame);
        document.getElementById('btn-volume-down').addEventListener('click', () => adjustVolume(-0.1));
        document.getElementById('btn-volume-up').addEventListener('click', () => adjustVolume(+0.1));
        document.getElementById('btn-save').addEventListener('click', saveGame);
        document.getElementById('btn-load').addEventListener('click', loadGame);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'F11' || (e.key === 'Enter' && e.altKey)) {
                e.preventDefault();
                toggleFullscreen();
            }
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                saveGame();
            }
        });

        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement) {
                isFullscreen = false;
                updateFullscreenButton();
            }
        });
    }

    function toggleFullscreen() {
        if (!dosProps) return;
        isFullscreen = !isFullscreen;
        dosProps.setFullScreen(isFullscreen);
        updateFullscreenButton();
    }

    function updateFullscreenButton() {
        const btn = document.getElementById('btn-fullscreen');
        if (btn) btn.textContent = isFullscreen ? '🖥️ 退出全屏' : '🖥️ 全屏';
    }

    function togglePause() {
        if (!dosProps) return;
        if (isPaused) {
            dosProps.setPaused(false);
            isPaused = false;
            document.getElementById('btn-pause').textContent = '⏯️ 暂停';
        } else {
            dosProps.setPaused(true);
            isPaused = true;
            document.getElementById('btn-pause').textContent = '▶️ 继续';
        }
    }

    function adjustVolume(delta) {
        volume = Math.max(0, Math.min(1, volume + delta));
        if (dosProps) dosProps.setVolume(volume);
    }

    // ═══════════════════════════════════════════════════════════════
    //  Restart
    // ═══════════════════════════════════════════════════════════════

    async function restartGame() {
        if (!dosProps) return;
        if (!confirm('确定要重新开始游戏吗？未保存的进度会丢失。')) return;

        document.getElementById('save-status').textContent = '重启中...';
        await stopPlayer();
        try {
            await createDosPlayer();
            document.getElementById('save-status').textContent = '游戏已重启';
        } catch (e) {
            console.error('[game.js] Restart failed:', e);
            document.getElementById('save-status').textContent = '重启失败';
        }
    }

    async function stopPlayer() {
        console.log('[game.js] Stopping player...');
        if (dosProps) {
            try { await dosProps.stop(); } catch (e) { console.warn('[game.js] stop() error:', e); }
            dosProps = null;
            dosCI = null;
        }
        // Small delay to let js-dos release IndexedDB connections
        await new Promise(r => setTimeout(r, 500));
        console.log('[game.js] Player stopped');
    }

    // ═══════════════════════════════════════════════════════════════
    //  Save  (browser + cloud)
    // ═══════════════════════════════════════════════════════════════

    async function saveGame() {
        if (!window.DOS.App.isLoggedIn()) {
            window.DOS.App.showToast('请先登录以保存游戏进度', 'warning');
            return;
        }
        if (!dosProps) {
            window.DOS.App.showToast('游戏尚未加载', 'error');
            return;
        }

        const saveStatus = document.getElementById('save-status');
        saveStatus.textContent = '保存中...';
        console.log('[game.js] Saving game...');

        try {
            // Step 1 — persist in-memory filesystem → IndexedDB
            const persisted = await dosProps.save();
            console.log('[game.js] dosProps.save() returned:', persisted);
            if (!persisted) {
                window.DOS.App.showToast('没有需要保存的进度 (可能游戏尚未产生存档文件)', 'warning');
                saveStatus.textContent = '无新进度';
                return;
            }

            // Step 2 — export IndexedDB data
            saveStatus.textContent = '正在导出存档...';
            const saveBundle = await exportSaveBundle();
            console.log('[game.js] Export result:', saveBundle ? `${Object.keys(saveBundle.dbs).length} DBs` : 'null');
            if (!saveBundle) {
                window.DOS.App.showToast('游戏进度已保存到浏览器 (云端同步不可用)', 'warning');
                saveStatus.textContent = '已保存 (仅浏览器)';
                return;
            }

            // Step 3 — upload to server
            saveStatus.textContent = '正在上传到云端...';
            const json = JSON.stringify(saveBundle);
            const payload = JSON.stringify({ save_data: btoa(unescape(encodeURIComponent(json))) });
            console.log('[game.js] Save payload size:', payload.length, 'bytes');

            const resp = await window.DOS.App.apiFetch(
                `/api/games/${encodeURIComponent(GAME_ID)}/save`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: payload,
                }
            );

            if (resp.ok) {
                console.log('[game.js] Save uploaded successfully');
                window.DOS.App.showToast('游戏进度已保存到云端 ✅', 'success');
                saveStatus.textContent = '已保存 (云端 + 浏览器)';
            } else {
                const errData = await resp.json().catch(() => ({}));
                throw new Error(errData.error || `服务器错误 (${resp.status})`);
            }
        } catch (err) {
            console.error('[game.js] Save error:', err);
            window.DOS.App.showToast('保存失败: ' + err.message, 'error');
            saveStatus.textContent = '保存失败';
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  Load  (cloud → browser)
    // ═══════════════════════════════════════════════════════════════

    async function loadGame() {
        if (!window.DOS.App.isLoggedIn()) {
            window.DOS.App.showToast('请先登录以加载游戏进度', 'warning');
            return;
        }

        const saveStatus = document.getElementById('save-status');
        saveStatus.textContent = '正在查找云端存档...';
        console.log('[game.js] Loading save...');

        let saveBundle = null;

        // ── Phase 1: Download & validate ──
        try {
            const resp = await window.DOS.App.apiFetch(
                `/api/games/${encodeURIComponent(GAME_ID)}/save`
            );

            if (!resp.ok) {
                if (resp.status === 404) {
                    window.DOS.App.showToast('没有找到云端存档', 'warning');
                } else {
                    window.DOS.App.showToast('加载存档失败', 'error');
                }
                saveStatus.textContent = '游戏已就绪';
                return;
            }

            const blob = await resp.blob();
            if (!blob || blob.size === 0) {
                window.DOS.App.showToast('云端存档为空', 'warning');
                return;
            }
            console.log('[game.js] Downloaded save blob:', blob.size, 'bytes');

            const rawText = await blob.text();
            saveBundle = JSON.parse(rawText);
            console.log('[game.js] Parsed save bundle, DBs:', Object.keys(saveBundle.dbs || {}));

            if (!saveBundle.dbs || Object.keys(saveBundle.dbs).length === 0) {
                window.DOS.App.showToast('存档数据为空', 'warning');
                return;
            }
        } catch (err) {
            console.error('[game.js] Download/parse error:', err);
            window.DOS.App.showToast('存档数据格式错误', 'error');
            saveStatus.textContent = '游戏已就绪';
            return;
        }

        // ── Phase 2: Confirm ──
        const ts = saveBundle.ts ? new Date(saveBundle.ts).toLocaleString('zh-CN') : '未知';
        if (!confirm(`确定要加载云端存档吗？\n保存时间：${ts}\n当前未保存的进度会丢失。`)) return;

        // ── Phase 3: Stop current game ──
        saveStatus.textContent = '正在停止游戏...';
        console.log('[game.js] Stopping current player for save restore');
        await stopPlayer();

        // ── Phase 4: Clear old IndexedDB data ──
        saveStatus.textContent = '正在清理旧存档...';
        console.log('[game.js] Clearing old IndexedDB data');
        try {
            const oldDbNames = await discoverDbNames();
            for (const name of oldDbNames) {
                console.log('[game.js] Deleting IDB:', name);
                await deleteDatabase(name);
            }
            // Invalidate cache so next discovery finds the freshly restored DBs
            saveDbNames = null;
        } catch (e) {
            console.warn('[game.js] IDB cleanup warning:', e);
        }

        // ── Phase 5: Write save data to IndexedDB ──
        saveStatus.textContent = '正在恢复存档...';
        console.log('[game.js] Writing save data to IndexedDB');
        try {
            await importSaveBundle(saveBundle);
            console.log('[game.js] Save data written to IndexedDB');
        } catch (err) {
            console.error('[game.js] IndexedDB write failed:', err);
            window.DOS.App.showToast('存档数据写入失败，将以新游戏启动', 'warning');
            // Fall through — start fresh
        }

        // ── Phase 6: Restart game ──
        saveStatus.textContent = '正在重新启动游戏...';
        console.log('[game.js] Creating new Dos player with restored save');
        try {
            await createDosPlayer();
            console.log('[game.js] Game restarted successfully with save');
            window.DOS.App.showToast('云端存档已加载 ✅', 'success');
            saveStatus.textContent = '存档已恢复';
        } catch (err) {
            console.error('[game.js] Restart after load failed:', err);
            // Last-resort fallback: clear everything and start fresh
            saveStatus.textContent = '存档恢复失败，正在清理...';
            try {
                const dbs = await discoverDbNames();
                for (const name of dbs) {
                    await deleteDatabase(name);
                }
                saveDbNames = null;
            } catch (e) { /* ignore */ }

            try {
                await createDosPlayer();
                window.DOS.App.showToast('存档恢复失败，已启动新游戏', 'warning');
                saveStatus.textContent = '游戏已就绪 (新游戏)';
            } catch (e2) {
                console.error('[game.js] Final restart also failed:', e2);
                window.DOS.App.showToast('游戏启动失败，请刷新页面', 'error');
                saveStatus.textContent = '启动失败';
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  IndexedDB helpers
    // ═══════════════════════════════════════════════════════════════

    /** Discover which IndexedDB databases js-dos uses for IDBFS. */
    async function discoverDbNames() {
        if (saveDbNames) return saveDbNames;

        let candidates = [];
        try {
            if (typeof indexedDB.databases === 'function') {
                const list = await indexedDB.databases();
                candidates = list.map(d => d.name);
                console.log('[game.js] indexedDB.databases():', candidates);
            }
        } catch (e) { /* fall through */ }

        // Always probe the most common Emscripten IDBFS mount names
        const common = ['/home/web_user', '/', '/emscripten_idbfs', 'emscripten_idbfs'];
        for (const name of common) {
            if (!candidates.includes(name)) candidates.push(name);
        }

        // Filter to ones that actually exist
        const valid = [];
        for (const name of candidates) {
            const ok = await dbExists(name);
            if (ok) valid.push(name);
        }

        console.log('[game.js] Discovered IDB names:', valid);
        saveDbNames = valid;
        return valid;
    }

    /** Check whether an IndexedDB database exists. */
    function dbExists(name) {
        return new Promise((resolve) => {
            try {
                const req = indexedDB.open(name);
                req.onsuccess = () => { req.result.close(); resolve(true); };
                req.onerror = () => resolve(false);
                req.onblocked = () => { console.warn('[game.js] dbExists blocked:', name); resolve(false); };
            } catch (e) {
                resolve(false);
            }
        });
    }

    /** Delete an IndexedDB database. */
    function deleteDatabase(name) {
        return new Promise((resolve) => {
            try {
                const req = indexedDB.deleteDatabase(name);
                req.onsuccess = () => { console.log('[game.js] Deleted IDB:', name); resolve(); };
                req.onerror = () => { console.warn('[game.js] Failed to delete IDB:', name, req.error); resolve(); };
                req.onblocked = () => { console.warn('[game.js] Delete blocked:', name); resolve(); };
            } catch (e) {
                console.warn('[game.js] deleteDatabase error:', name, e);
                resolve();
            }
        });
    }

    /** Export all data from the discovered databases into a serialisable bundle. */
    async function exportSaveBundle() {
        const dbNames = await discoverDbNames();
        if (dbNames.length === 0) {
            console.warn('[game.js] No IDB databases found to export');
            return null;
        }

        const dbs = {};
        for (const dbName of dbNames) {
            try {
                const stores = await readAllStores(dbName);
                if (stores && Object.keys(stores).length > 0) {
                    dbs[dbName] = stores;
                    console.log('[game.js] Exported DB', dbName, 'stores:', Object.keys(stores).join(', '));
                }
            } catch (e) {
                console.warn('[game.js] Failed to read DB', dbName, e);
            }
        }

        if (Object.keys(dbs).length === 0) return null;

        return {
            v: 1,
            game: GAME_ID,
            ts: Date.now(),
            dbs: dbs,
        };
    }

    /** Read every object store from a single IndexedDB database. */
    function readAllStores(dbName) {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(dbName);
            req.onerror = () => reject(req.error);
            req.onsuccess = () => {
                const db = req.result;
                const names = Array.from(db.objectStoreNames);
                if (names.length === 0) { db.close(); resolve({}); return; }

                const stores = {};
                let pending = names.length;

                for (const storeName of names) {
                    readStore(db, storeName).then(entries => {
                        if (entries.length > 0) stores[storeName] = entries;
                    }).catch(() => {}).finally(() => {
                        pending--;
                        if (pending === 0) { db.close(); resolve(stores); }
                    });
                }
            };
        });
    }

    /** Read all entries from one object store, serialising binary values. */
    function readStore(db, storeName) {
        return new Promise((resolve) => {
            const entries = [];
            try {
                const tx = db.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                const cursorReq = store.openCursor();
                cursorReq.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor) {
                        entries.push({
                            key: cursor.key,
                            value: serialiseValue(cursor.value),
                        });
                        cursor.continue();
                    } else {
                        resolve(entries);
                    }
                };
                cursorReq.onerror = () => resolve(entries);
            } catch (e) {
                resolve(entries);
            }
        });
    }

    /** Deep-clone a value, converting ArrayBuffer / Uint8Array to base64. */
    function serialiseValue(v) {
        if (v instanceof ArrayBuffer || v instanceof Uint8Array) {
            return { __b: bufToBase64(v) };
        }
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            const out = {};
            for (const [k, val] of Object.entries(v)) {
                if (val instanceof ArrayBuffer || val instanceof Uint8Array) {
                    out[k] = { __b: bufToBase64(val) };
                } else {
                    out[k] = val;
                }
            }
            return out;
        }
        return v;
    }

    function bufToBase64(buf) {
        const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
    }

    function base64ToBuf(b64) {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes.buffer;
    }

    /** Deserialise a value, converting {__b: ...} markers back to ArrayBuffer. */
    function deserialiseValue(v) {
        if (v && typeof v === 'object' && v.__b !== undefined) {
            return base64ToBuf(v.__b);
        }
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            const out = {};
            for (const [k, val] of Object.entries(v)) {
                out[k] = (val && typeof val === 'object' && val.__b !== undefined)
                    ? base64ToBuf(val.__b)
                    : val;
            }
            return out;
        }
        return v;
    }

    /** Write a save bundle back into IndexedDB. */
    async function importSaveBundle(bundle) {
        const dbNames = Object.keys(bundle.dbs);
        console.log('[game.js] Importing save to', dbNames.length, 'DB(s):', dbNames.join(', '));
        for (const dbName of dbNames) {
            await writeAllStores(dbName, bundle.dbs[dbName]);
        }
        // Update the cache to include the DBs we just wrote
        saveDbNames = dbNames;
        console.log('[game.js] Import complete');
    }

    /** Write store data into an IndexedDB database, creating stores if needed. */
    function writeAllStores(dbName, stores) {
        return new Promise((resolve, reject) => {
            const storeNames = Object.keys(stores);
            if (storeNames.length === 0) return resolve();

            console.log('[game.js] writeAllStores: db=', dbName, 'stores=', storeNames.join(', '));

            // Open with version 1 to get the base version; if DB doesn't exist
            // yet this will create it (version 1).
            const req = indexedDB.open(dbName);
            req.onerror = () => reject(req.error);
            req.onblocked = () => {
                console.warn('[game.js] writeAllStores blocked:', dbName);
                reject(new Error('Database blocked — another connection may be open'));
            };
            req.onsuccess = () => {
                const db = req.result;
                const existing = Array.from(db.objectStoreNames);
                const version = db.version;
                db.close();
                console.log('[game.js] writeAllStores: existing stores=', existing.join(', '), 'version=', version);

                const missing = storeNames.filter(n => !existing.includes(n));
                if (missing.length === 0) {
                    writeStoresDirect(dbName, stores).then(resolve).catch(reject);
                } else {
                    console.log('[game.js] Creating missing stores:', missing.join(', '));
                    const upReq = indexedDB.open(dbName, version + 1);
                    upReq.onblocked = () => {
                        console.warn('[game.js] Version upgrade blocked:', dbName);
                        reject(new Error('Database upgrade blocked'));
                    };
                    upReq.onupgradeneeded = (e) => {
                        const udb = e.target.result;
                        for (const name of missing) {
                            if (!udb.objectStoreNames.contains(name)) {
                                try { udb.createObjectStore(name); console.log('[game.js] Created store:', name); } catch (_) {}
                            }
                        }
                    };
                    upReq.onsuccess = () => {
                        const upgradedDb = upReq.result;
                        const ver = upgradedDb.version;
                        upgradedDb.close();
                        console.log('[game.js] DB upgraded to version', ver);
                        writeStoresDirect(dbName, stores).then(resolve).catch(reject);
                    };
                    upReq.onerror = () => reject(upReq.error);
                }
            };
        });
    }

    function writeStoresDirect(dbName, stores) {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(dbName);
            req.onerror = () => reject(req.error);
            req.onblocked = () => reject(new Error('Database blocked on write'));
            req.onsuccess = () => {
                const db = req.result;
                const names = Object.keys(stores);
                let pending = names.length;

                if (pending === 0) { db.close(); resolve(); return; }

                for (const storeName of names) {
                    const entries = stores[storeName];
                    if (!entries || entries.length === 0) {
                        pending--;
                        if (pending === 0) { db.close(); resolve(); }
                        continue;
                    }

                    (function (sName, ents) {
                        try {
                            const tx = db.transaction(sName, 'readwrite');
                            const store = tx.objectStore(sName);
                            let puts = 0;
                            for (const { key, value } of ents) {
                                const deser = deserialiseValue(value);
                                store.put(deser, key);
                                puts++;
                            }
                            console.log('[game.js] Wrote', puts, 'entries to', dbName + '/' + sName);
                            tx.oncomplete = () => {
                                pending--;
                                if (pending === 0) { db.close(); resolve(); }
                            };
                            tx.onerror = () => {
                                console.warn('[game.js] Transaction error on', dbName + '/' + sName);
                                pending--;
                                if (pending === 0) { db.close(); resolve(); }
                            };
                            tx.onabort = () => {
                                console.warn('[game.js] Transaction aborted on', dbName + '/' + sName);
                                pending--;
                                if (pending === 0) { db.close(); resolve(); }
                            };
                        } catch (e) {
                            console.warn('[game.js] writeStoresDirect error for', sName, e);
                            pending--;
                            if (pending === 0) { db.close(); resolve(); }
                        }
                    })(storeName, entries);
                }
            };
        });
    }

    // ═══════════════════════════════════════════════════════════════
    //  Existing-save check (sidebar badge)
    // ═══════════════════════════════════════════════════════════════

    async function checkExistingSave() {
        try {
            const resp = await window.DOS.App.apiFetch(
                `/api/games/${encodeURIComponent(GAME_ID)}/save`
            );
            if (resp.ok) {
                const saveInfoCard = document.getElementById('save-info-card');
                const saveInfoText = document.getElementById('save-info-text');
                if (saveInfoCard && saveInfoText) {
                    saveInfoCard.style.display = 'block';
                    saveInfoText.textContent = '已有云端存档';
                }
            }
        } catch (e) { /* ignore */ }
    }

    // ═══════════════════════════════════════════════════════════════
    //  Metadata sidebar
    // ═══════════════════════════════════════════════════════════════

    async function loadMetadata() {
        try {
            const resp = await fetch(`/api/metadata/${encodeURIComponent(GAME_ID)}`);
            if (!resp.ok) return;

            const data = await resp.json();
            if (!data || (!data.description_zh && !data.description_en)) return;

            const card = document.getElementById('metadata-card');
            const content = document.getElementById('metadata-content');
            if (!card || !content) return;

            let html = '';
            if (data.description_zh) {
                html += `<p style="font-size:0.85rem;line-height:1.7;color:var(--text);">${data.description_zh}</p>`;
            }
            if (data.description_en && !data.description_zh) {
                html += `<p style="font-size:0.85rem;line-height:1.7;color:var(--text);">${data.description_en}</p>`;
            }
            if (data.wikipedia_url) {
                html += `<a href="${data.wikipedia_url}" target="_blank" rel="noopener" class="sidebar-link" style="margin-top:8px;">📖 Wikipedia →</a>`;
            }

            if (html) {
                content.innerHTML = html;
                card.style.display = 'block';
            }
        } catch (e) { /* ignore */ }
    }
})();
