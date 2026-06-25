/**
 * Chinese DOS Games — js-dos v8 Game Player
 *
 * Save Architecture:
 * ─────────────────
 * Game saves work because we ALWAYS use a consistent BUNDLE_URL for js-dos,
 * regardless of whether Cache API is available:
 *
 * - BUNDLE_URL = /api/games/{GAME_ID}/bundle (always same URL)
 * - Cache API: serves bundle from browser Cache API (if available)
 * - No Cache API: serves bundle via Flask endpoint (same URL)
 * - js-dos: keys saves by the URL, so same URL = same saves found
 *
 * Local Files / Downloads:
 * - File System Access API lets users pick .jsdos/.zip from their machine
 * - Downloaded bundles are cached in IndexedDB + Cache API
 * - Server download is the fallback if no local file is stored
 *
 * Save Persistence:
 * - autoSave: true enables periodic saves to IndexedDB
 * - Page refresh: js-dos auto-restores from IndexedDB with same BUNDLE_URL
 * - No cloud sync required: all saves are local to the browser
 * - No authentication needed: saves don't depend on login status
 */
(function () {
    'use strict';

    let dosProps = null;
    let dosCI = null;
    let isPaused = false;
    let isFullscreen = false;
    let volume = 1.0;
    let bundleBlobUrl = null;  // Track Blob URL for cleanup
    let lastGoodScreenshot = null;  // Fallback: last successful screenshot
    let _inputPaused = false;       // Track: did WE pause for chat input?

    const GAME_ID = window.GAME_ID;
    const GAME_NAME = window.GAME_NAME || GAME_ID;
    const BUNDLE_URL = `/api/games/${encodeURIComponent(GAME_ID)}/bundle`;
    const CACHE_NAME = 'dos-games-v1';
    const CACHE_DB = 'dos-games-cache';
    const STORE_BUNDLES = 'bundles';
    const STORE_HANDLES = 'file-handles';
    const STORE_SAVES = 'saves';
    const SAVE_MARKER_KEY = 'saved_games_index';  // localStorage key for profile page

    const LOADING_HTML = `
        <div class="loading-spinner"></div>
        <p class="loading-text" id="loading-text">正在加载游戏...</p>
    `;

    // ═══════════════════════════════════════════════════════════════
    //  Cache API — makes any bundle available at BUNDLE_URL
    //  so js-dos always sees the same URL and can find its saves.
    //  Falls back gracefully when Cache API is unavailable
    //  (e.g. Firefox private browsing, older browsers).
    // ═══════════════════════════════════════════════════════════════

    function cacheApiAvailable() {
        return typeof caches !== 'undefined' && typeof Cache !== 'undefined';
    }

    /** Cache a blob at BUNDLE_URL. Returns true on success. */
    async function cacheBundleAtUrl(blob) {
        if (!cacheApiAvailable()) {
            console.warn('[game.js] Cache API not available, skipping cache');
            return false;
        }
        try {
            const cache = await caches.open(CACHE_NAME);
            await cache.delete(BUNDLE_URL);
            await cache.put(BUNDLE_URL, new Response(blob, {
                headers: { 'Content-Type': 'application/zip' },
            }));
            console.log('[game.js] Cached bundle at', BUNDLE_URL, (blob.size / 1048576).toFixed(1), 'MB');
            return true;
        } catch (e) {
            console.warn('[game.js] Cache API error:', e.message);
            return false;
        }
    }

    /** Check if we have a bundle cached at BUNDLE_URL. */
    async function hasBundleCached() {
        if (!cacheApiAvailable()) return false;
        try {
            const cache = await caches.open(CACHE_NAME);
            return !!(await cache.match(BUNDLE_URL));
        } catch (e) {
            return false;
        }
    }

    /** Clear stale cache data. */
    async function clearBundleCache() {
        if (!cacheApiAvailable()) return;
        try {
            const cache = await caches.open(CACHE_NAME);
            await cache.delete(BUNDLE_URL);
        } catch (e) { /* ignore */ }
    }

    // ═══════════════════════════════════════════════════════════════
    //  IndexedDB helpers (handles + bundle backup + saves)
    // ═══════════════════════════════════════════════════════════════

    function openCacheDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(CACHE_DB, 3);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_BUNDLES)) db.createObjectStore(STORE_BUNDLES);
                if (!db.objectStoreNames.contains(STORE_HANDLES)) db.createObjectStore(STORE_HANDLES);
                if (!db.objectStoreNames.contains(STORE_SAVES)) db.createObjectStore(STORE_SAVES);
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => {
                // If version conflict (old data), delete and recreate
                console.warn('[game.js] IDB open failed, clearing:', req.error);
                const delReq = indexedDB.deleteDatabase(CACHE_DB);
                delReq.onsuccess = () => {
                    const retry = indexedDB.open(CACHE_DB, 3);
                    retry.onupgradeneeded = (e2) => {
                        const db2 = e2.target.result;
                        if (!db2.objectStoreNames.contains(STORE_BUNDLES)) db2.createObjectStore(STORE_BUNDLES);
                        if (!db2.objectStoreNames.contains(STORE_HANDLES)) db2.createObjectStore(STORE_HANDLES);
                        if (!db2.objectStoreNames.contains(STORE_SAVES)) db2.createObjectStore(STORE_SAVES);
                    };
                    retry.onsuccess = () => resolve(retry.result);
                    retry.onerror = () => reject(retry.error);
                };
                delReq.onerror = () => reject(delReq.error);
            };
            req.onblocked = () => {
                console.warn('[game.js] IDB open blocked, retrying...');
                setTimeout(() => {
                    const retry = indexedDB.open(CACHE_DB, 3);
                    retry.onupgradeneeded = (e2) => {
                        const db2 = e2.target.result;
                        if (!db2.objectStoreNames.contains(STORE_BUNDLES)) db2.createObjectStore(STORE_BUNDLES);
                        if (!db2.objectStoreNames.contains(STORE_HANDLES)) db2.createObjectStore(STORE_HANDLES);
                        if (!db2.objectStoreNames.contains(STORE_SAVES)) db2.createObjectStore(STORE_SAVES);
                    };
                    retry.onsuccess = () => resolve(retry.result);
                    retry.onerror = () => reject(retry.error);
                }, 500);
            };
        });
    }

    // ── FileSystemFileHandle ──

    async function putFileHandle(gameId, handle) {
        const db = await openCacheDB();
        return new Promise((r) => {
            const tx = db.transaction(STORE_HANDLES, 'readwrite');
            tx.objectStore(STORE_HANDLES).put(handle, gameId);
            tx.oncomplete = () => { db.close(); r(); };
            tx.onerror = () => { db.close(); r(); };
        });
    }

    async function getFileHandle(gameId) {
        try {
            const db = await openCacheDB();
            return new Promise((r) => {
                const tx = db.transaction(STORE_HANDLES, 'readonly');
                const req = tx.objectStore(STORE_HANDLES).get(gameId);
                req.onsuccess = () => { db.close(); r(req.result || null); };
                req.onerror = () => { db.close(); r(null); };
            });
        } catch (e) { return null; }
    }

    async function removeFileHandle(gameId) {
        const db = await openCacheDB();
        return new Promise((r) => {
            const tx = db.transaction(STORE_HANDLES, 'readwrite');
            tx.objectStore(STORE_HANDLES).delete(gameId);
            tx.oncomplete = () => { db.close(); r(); };
            tx.onerror = () => { db.close(); r(); };
        });
    }

    // ── Bundle backup in IDB (fallback if Cache API is cleared) ──

    async function idbBackupBundle(gameId, blob) {
        const db = await openCacheDB();
        return new Promise((r) => {
            const tx = db.transaction(STORE_BUNDLES, 'readwrite');
            tx.objectStore(STORE_BUNDLES).put(blob, gameId);
            tx.oncomplete = () => { db.close(); r(); };
            tx.onerror = () => { db.close(); r(); };
        });
    }

    async function idbGetBundle(gameId) {
        try {
            const db = await openCacheDB();
            return new Promise((r) => {
                const tx = db.transaction(STORE_BUNDLES, 'readonly');
                const req = tx.objectStore(STORE_BUNDLES).get(gameId);
                req.onsuccess = () => { db.close(); r(req.result || null); };
                req.onerror = () => { db.close(); r(null); };
            });
        } catch (e) { return null; }
    }

    async function idbRemoveBundle(gameId) {
        const db = await openCacheDB();
        return new Promise((r) => {
            const tx = db.transaction(STORE_BUNDLES, 'readwrite');
            tx.objectStore(STORE_BUNDLES).delete(gameId);
            tx.oncomplete = () => { db.close(); r(); };
            tx.onerror = () => { db.close(); r(); };
        });
    }

    // ── Save state (persist() result) ──

    async function putSaveState(gameId, data) {
        const db = await openCacheDB();
        return new Promise((r) => {
            const tx = db.transaction(STORE_SAVES, 'readwrite');
            tx.objectStore(STORE_SAVES).put(data, gameId);
            tx.oncomplete = () => { db.close(); r(); };
            tx.onerror = () => { db.close(); r(); };
        });
    }

    async function getSaveState(gameId) {
        try {
            const db = await openCacheDB();
            return new Promise((r) => {
                const tx = db.transaction(STORE_SAVES, 'readonly');
                const req = tx.objectStore(STORE_SAVES).get(gameId);
                req.onsuccess = () => { db.close(); r(req.result || null); };
                req.onerror = () => { db.close(); r(null); };
            });
        } catch (e) { return null; }
    }

    async function removeSaveState(gameId) {
        const db = await openCacheDB();
        return new Promise((r) => {
            const tx = db.transaction(STORE_SAVES, 'readwrite');
            tx.objectStore(STORE_SAVES).delete(gameId);
            tx.oncomplete = () => { db.close(); r(); };
            tx.onerror = () => { db.close(); r(); };
        });
    }

    // ── Sockdrive helpers ──

    async function deleteLocalSaves() {
        let names = [];
        try {
            if (typeof indexedDB.databases === 'function') {
                names = (await indexedDB.databases()).map(d => d.name);
            }
        } catch (e) { /* */ }
        for (const name of names) {
            if (name.startsWith('sockdrive ') || name.startsWith('js-dos-cache ')) {
                await new Promise((r) => {
                    const req = indexedDB.deleteDatabase(name);
                    req.onsuccess = r; req.onerror = r; req.onblocked = r;
                });
            }
        }
    }

    async function hasLocalSave() {
        try {
            if (typeof indexedDB.databases !== 'function') return false;
            return (await indexedDB.databases()).some(d => d.name.startsWith('sockdrive '));
        } catch (e) { return false; }
    }

    // ═══════════════════════════════════════════════════════════════
    //  File System Access API
    // ═══════════════════════════════════════════════════════════════

    async function pickLocalFile() {
        if (!window.showOpenFilePicker) return null;
        try {
            const [handle] = await window.showOpenFilePicker({
                types: [{ description: 'js-dos Bundle',
                    accept: { 'application/zip': ['.jsdos', '.zip'] } }],
            });
            return handle;
        } catch (e) { return null; }
    }

    async function readFileFromHandle(handle) {
        const opts = { mode: 'read' };
        if (await handle.queryPermission(opts) !== 'granted') {
            if (!await handle.requestPermission(opts)) throw new Error('文件读取权限被拒绝');
        }
        return await handle.getFile();
    }

    async function tryStoredHandle() {
        const handle = await getFileHandle(GAME_ID);
        if (!handle) return null;
        try { return await readFileFromHandle(handle); }
        catch (e) { await removeFileHandle(GAME_ID); return null; }
    }

    // ═══════════════════════════════════════════════════════════════
    //  Bundle preparation — ensure content is at BUNDLE_URL
    // ═══════════════════════════════════════════════════════════════

    /** Returns URL to use for Dos(), or null if user action needed. */
    async function prepareBundle() {
        // 1. Try stored local file handle
        const localFile = await tryStoredHandle();
        if (localFile) {
            const cached = await cacheBundleAtUrl(localFile);
            await idbBackupBundle(GAME_ID, localFile);
            const src = document.getElementById('source-indicator');
            const det = document.getElementById('source-detail');
            if (src) src.textContent = '📁 本地文件';
            if (det) det.textContent = localFile.name + ' · ' + (localFile.size / 1048576).toFixed(1) + ' MB';
            if (cached) {
                return BUNDLE_URL;
            } else {
                console.warn('[game.js] Cache API unavailable, but using BUNDLE_URL for consistency (saves will work)');
                return BUNDLE_URL;
            }
        }

        // 2. Try IndexedDB backup (survives Cache API eviction)
        const idbBlob = await idbGetBundle(GAME_ID);
        if (idbBlob) {
            const cached = await cacheBundleAtUrl(idbBlob);
            const src = document.getElementById('source-indicator');
            const det = document.getElementById('source-detail');
            if (src) src.textContent = '💾 浏览器缓存';
            if (det) det.textContent = (idbBlob.size / 1048576).toFixed(1) + ' MB';
            return BUNDLE_URL;
        }

        // 3. Nothing available — need user action (first-run UI)
        return null;
    }

    // ═══════════════════════════════════════════════════════════════
    //  Player — always uses BUNDLE_URL (consistent!)
    // ═══════════════════════════════════════════════════════════════

    async function createDosPlayer(bundleUrl) {
        const container = document.getElementById('dos-container');
        const saveStatus = document.getElementById('save-status');
        if (!container) return Promise.reject(new Error('页面元素缺失'));

        const url = bundleUrl || BUNDLE_URL;

        container.innerHTML = '';
        const le = document.createElement('div');
        le.className = 'game-loading';
        le.id = 'game-loading';
        le.innerHTML = LOADING_HTML;
        container.appendChild(le);

        console.log('[game.js] Dos() url:', url);

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('游戏加载超时，请检查文件或网络'));
            }, 120000);

            try {
                dosProps = Dos(container, {
                    url: url,
                    backend: 'dosboxX',
                    volume: volume,
                    autoStart: true,
                    autoSave: true,
                    onEvent: (event, ci) => {
                        console.log('[game.js] Dos event:', event);
                        if (event === 'ci-ready') {
                            clearTimeout(timeout);
                            dosCI = ci;
                            const el = document.getElementById('game-loading');
                            if (el) el.classList.add('hidden');
                            if (saveStatus) saveStatus.textContent = '游戏已就绪';
                            resolve(ci);
                        } else if (event === 'fullscreen-changed') {
                            isFullscreen = !!ci;
                            updateFullscreenButton();
                        } else if (event === 'bnd-play' || event === 'bnd-ready') {
                            const lt = document.getElementById('loading-text');
                            if (lt) lt.textContent = '正在启动模拟器...';
                        }
                    },
                });
            } catch (err) {
                clearTimeout(timeout);
                reject(err);
            }
        });
    }

    // ═══════════════════════════════════════════════════════════════
    //  Display scaling — scale game canvas on high-DPI / 4K displays
    //  Baseline: 1920px-wide viewport (1080p) = scale 1.0
    // ═══════════════════════════════════════════════════════════════

    const BASELINE_WIDTH = 1920;
    let _displayScale = 1.0;

    function applyDisplayScale() {
        const vw = window.innerWidth;
        // Only scale up, never scale down below 1.0
        _displayScale = Math.max(1.0, vw / BASELINE_WIDTH);
        // Clamp to 2.5x max (4K at 150% scaling = 2560px → ~1.33x, 5K/ultrawide → higher)
        _displayScale = Math.min(2.5, _displayScale);

        const gamePage = document.querySelector('.game-page');
        if (gamePage) {
            gamePage.style.maxWidth = Math.round(1400 * _displayScale) + 'px';
        }

        console.log('[game.js] Display scale: ' + _displayScale.toFixed(2) +
            ' (viewport: ' + vw + 'px, baseline: ' + BASELINE_WIDTH + 'px)');
    }

    // Run early, then again on resize
    applyDisplayScale();
    window.addEventListener('resize', applyDisplayScale);

    // ═══════════════════════════════════════════════════════════════
    //  Startup
    // ═══════════════════════════════════════════════════════════════

    document.addEventListener('DOMContentLoaded', async () => {
        const container = document.getElementById('dos-container');
        if (!container || !GAME_ID) return;

        setupControls();
        loadMetadata();
        updateStorageInfo();
        checkLocalSave();

        try {
            const bundleUrl = await prepareBundle();

            if (!bundleUrl) {
                // No local bundle — auto-download from server (game-on-demand)
                showAutoDownloadUI();
                try {
                    await actionDownloadFromServer();
                } catch (downloadErr) {
                    // If auto-download fails, show manual first-run UI
                    console.warn('[game.js] Auto-download failed, showing manual UI:', downloadErr.message);
                    showFirstRunUI();
                }
                return;
            }

            // Track Blob URL for cleanup
            if (bundleUrl !== BUNDLE_URL) bundleBlobUrl = bundleUrl;

            await createDosPlayer(bundleUrl);
            hideFirstRunUI();
            checkLocalSave();
        } catch (err) {
            console.error('[game.js] Startup failed:', err);
            // Clear possibly stale cached data and retry once
            await clearBundleCache();
            await idbRemoveBundle(GAME_ID).catch(() => {});
            const le = document.getElementById('game-loading');
            if (le) {
                le.innerHTML = `<p style="color:var(--danger)">❌ 加载失败</p>
                    <p style="color:var(--text-muted);">${err.message || '未知错误'}</p>
                    <button class="btn btn-primary" onclick="location.reload()">重试</button>`;
                le.classList.remove('hidden');
            }
        }
    });

    // ═══════════════════════════════════════════════════════════════
    //  First-run UI
    // ═══════════════════════════════════════════════════════════════

    function showAutoDownloadUI() {
        // Show first-run card but with auto-download message
        const ui = document.getElementById('first-run-ui');
        if (ui) {
            ui.style.display = 'flex';
            // Replace content with download progress message
            ui.innerHTML = `
                <h2 style="margin-bottom:8px;">🎮 ${window.GAME_NAME || '游戏'}</h2>
                <div class="loading-spinner"></div>
                <p style="color:var(--text-muted);margin-top:16px;">📥 正在自动下载游戏文件...</p>
                <p style="font-size:0.8rem;color:var(--text-dim);margin-top:8px;">
                    首次游玩会自动下载，之后将使用本地缓存。
                </p>
            `;
        }
        document.getElementById('player-area').style.display = 'none';
    }

    function showFirstRunUI() {
        document.getElementById('first-run-ui').style.display = 'flex';
        document.getElementById('player-area').style.display = 'none';
    }

    function hideFirstRunUI() {
        document.getElementById('first-run-ui').style.display = 'none';
        document.getElementById('player-area').style.display = 'flex';
    }

    // ═══════════════════════════════════════════════════════════════
    //  UI actions (exposed globally for HTML onclick)
    // ═══════════════════════════════════════════════════════════════

    async function actionPickLocalFile() {
        const handle = await pickLocalFile();
        if (!handle) return;
        const file = await readFileFromHandle(handle);
        await putFileHandle(GAME_ID, handle);
        const cached = await cacheBundleAtUrl(file);
        await idbBackupBundle(GAME_ID, file);
        updateStorageInfo();

        try {
            await createDosPlayer(BUNDLE_URL);
            hideFirstRunUI();
            checkLocalSave();
        } catch (err) {
            window.DOS.App.showToast('文件加载失败: ' + err.message, 'error');
        }
    }

    async function actionDownloadFromServer() {
        const lt = document.getElementById('loading-text');
        try {
            if (lt) lt.textContent = '正在从服务器下载游戏...';
            const resp = await fetch(BUNDLE_URL);
            if (!resp.ok) throw new Error('下载失败 (' + resp.status + ')');
            const blob = await resp.blob();
            console.log('[game.js] Downloaded:', (blob.size / 1048576).toFixed(1), 'MB');

            const cached = await cacheBundleAtUrl(blob);
            await idbBackupBundle(GAME_ID, blob);
            updateStorageInfo();

            await createDosPlayer(BUNDLE_URL);
            hideFirstRunUI();
            checkLocalSave();
        } catch (err) {
            window.DOS.App.showToast('下载失败: ' + err.message, 'error');
        }
    }

    async function actionClearLocalFile() {
        await removeFileHandle(GAME_ID);
        updateStorageInfo();
        window.DOS.App.showToast('已清除本地文件关联', 'info');
    }

    // ═══════════════════════════════════════════════════════════════
    //  UI updates
    // ═══════════════════════════════════════════════════════════════

    async function updateStorageInfo() {
        const handle = await getFileHandle(GAME_ID);
        const idbBlob = await idbGetBundle(GAME_ID);
        const cached = await hasBundleCached();
        const srcEl = document.getElementById('source-indicator');
        const detailEl = document.getElementById('source-detail');
        const clearBtn = document.getElementById('btn-clear-local');

        if (handle) {
            if (srcEl) srcEl.textContent = '📁 本地文件';
            try {
                const opts = { mode: 'read' };
                if (await handle.queryPermission(opts) === 'granted') {
                    const f = await handle.getFile();
                    if (detailEl) detailEl.textContent = f.name + ' · ' + (f.size / 1048576).toFixed(1) + ' MB';
                } else {
                    if (detailEl) detailEl.textContent = '需授权读取';
                }
            } catch (e) { if (detailEl) detailEl.textContent = '文件不可用'; }
            if (clearBtn) clearBtn.style.display = '';
        } else if (idbBlob || cached) {
            if (srcEl) srcEl.textContent = '💾 浏览器缓存';
            if (detailEl) {
                const sz = idbBlob ? idbBlob.size : 0;
                if (detailEl) detailEl.textContent = sz ? (sz / 1048576).toFixed(1) + ' MB' : '已缓存';
            }
            if (clearBtn) clearBtn.style.display = 'none';
        } else {
            if (srcEl) srcEl.textContent = '☁️ 需要下载';
            if (detailEl) detailEl.textContent = '首次运行需下载或选择本地文件';
            if (clearBtn) clearBtn.style.display = 'none';
        }
    }

    async function checkLocalSave() {
        const el = document.getElementById('save-indicator');
        const hint = document.getElementById('save-hint');
        if (!el) return;
        const hasSd = await hasLocalSave();
        const saved = await getSaveState(GAME_ID);
        const has = hasSd || (saved && saved.byteLength > 0);
        if (has) {
            const kb = saved ? (saved.byteLength / 1024).toFixed(0) : (hasSd ? '?' : '0');
            el.textContent = '💾 有存档 (' + kb + ' KB)';
            el.style.color = 'var(--success)';
            if (hint) hint.textContent = '✅ 下次打开此页面时自动加载存档';
            markGameSaved(kb);
        } else {
            el.textContent = '📝 新游戏';
            el.style.color = 'var(--text-muted)';
            if (hint) hint.textContent = '在游戏中保存后，点击下方 💾 保存按钮';
        }
    }

    function markGameSaved(kbSize) {
        try {
            const index = JSON.parse(localStorage.getItem(SAVE_MARKER_KEY) || '{}');
            index[GAME_ID] = {
                name: GAME_NAME,
                save_kb: kbSize || '?',
                updated_at: Date.now(),
            };
            localStorage.setItem(SAVE_MARKER_KEY, JSON.stringify(index));
        } catch (e) { /* ignore */ }
    }

    // ═══════════════════════════════════════════════════════════════
    //  Controls
    // ═══════════════════════════════════════════════════════════════

    function setupControls() {
        function updateSaveModeUI() {
            const saveBtn = document.getElementById('btn-save');
            const loadBtn = document.getElementById('btn-load-cloud');
            const deleteBtn = document.getElementById('btn-delete-save');
            const statusEl = document.getElementById('save-status');

            if (_saveMode === 'cloud') {
                saveBtn.title = '上传进度到云端';
                saveBtn.textContent = '☁️ 上传';
                loadBtn.style.display = '';
                deleteBtn.title = '删除云端存档';
                if (statusEl) statusEl.textContent = '';
                checkCloudSave();
            } else {
                saveBtn.title = '保存进度到本地';
                saveBtn.textContent = '💾 保存';
                loadBtn.style.display = 'none';
                deleteBtn.title = '删除本地存档';
                checkLocalSave();
            }
        }

        document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);
        document.getElementById('btn-pause').addEventListener('click', togglePause);
        document.getElementById('btn-restart').addEventListener('click', restartGame);
        document.getElementById('btn-volume-down').addEventListener('click', () => adjustVolume(-0.1));
        document.getElementById('btn-volume-up').addEventListener('click', () => adjustVolume(+0.1));
        document.getElementById('btn-save').addEventListener('click', saveGame);
        document.getElementById('btn-load-cloud').addEventListener('click', loadFromCloud);
        document.getElementById('btn-delete-save').addEventListener('click', deleteSave);

        // Save mode toggle
        const modeSelect = document.getElementById('save-mode');
        modeSelect.value = _saveMode;
        updateSaveModeUI();
        modeSelect.addEventListener('change', function() {
            _saveMode = this.value;
            localStorage.setItem('dos_save_mode', _saveMode);
            updateSaveModeUI();
            if (_saveMode === 'cloud' && !window.DOS.App.isLoggedIn()) {
                window.DOS.App.showToast('云端存档需要登录账号', 'info');
            }
            if (_saveMode === 'cloud') {
                checkCloudSave();
            } else {
                checkLocalSave();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'F11' || (e.key === 'Enter' && e.altKey)) { e.preventDefault(); toggleFullscreen(); }
            if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveGame(); }
        });
        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement) { isFullscreen = false; updateFullscreenButton(); }
        });

        suppressCloudSaveNotifications();
    }

    function suppressCloudSaveNotifications() {
        const checkNotifications = setInterval(() => {
            const notifications = document.querySelectorAll('[class*="notification"], [class*="toast"], [class*="message"], [class*="alert"]');
            notifications.forEach((el) => {
                const text = el.textContent || '';
                if (text.includes('browser') || text.includes('login') || text.includes('cloud') || text.includes('登录')) {
                    console.log('[game.js] Removing cloud save notification:', text.substring(0, 50));
                    el.style.display = 'none';
                    setTimeout(() => el.remove(), 100);
                }
            });
        }, 300);

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) {
                        const text = node.textContent || '';
                        if (text.includes('browser') || text.includes('login') || text.includes('cloud') || text.includes('登录')) {
                            console.log('[game.js] MutationObserver: Removing notification');
                            node.style.display = 'none';
                            setTimeout(() => node.remove(), 100);
                        }
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: false,
        });

        window.addEventListener('beforeunload', () => {
            clearInterval(checkNotifications);
            observer.disconnect();
        });
    }

    function toggleFullscreen() {
        if (!dosProps) return;
        isFullscreen = !isFullscreen;
        dosProps.setFullScreen(isFullscreen);
        updateFullscreenButton();
    }
    function updateFullscreenButton() {
        const b = document.getElementById('btn-fullscreen');
        if (b) b.textContent = isFullscreen ? '🖥️ 退出全屏' : '🖥️ 全屏';
    }
    function togglePause() {
        if (!dosProps) return;
        isPaused = !isPaused;
        _inputPaused = false;  // User manually toggled — clear input-pause flag
        dosProps.setPaused(isPaused);
        document.getElementById('btn-pause').textContent = isPaused ? '▶️ 继续' : '⏯️ 暂停';
    }
    function adjustVolume(d) {
        volume = Math.max(0, Math.min(1, volume + d));
        if (dosProps) dosProps.setVolume(volume);
    }

    // ═══════════════════════════════════════════════════════════════
    //  Save / Delete / Restart
    // ═══════════════════════════════════════════════════════════════

    let _saveMode = localStorage.getItem('dos_save_mode') || 'local';

    function getSaveMode() { return _saveMode; }

    async function saveGame() {
        const ss = document.getElementById('save-status');
        if (!dosCI) {
            window.DOS.App.showToast('游戏尚未加载', 'warning');
            return;
        }

        if (_saveMode === 'cloud') {
            await saveToCloud();
            return;
        }

        // ── Local save (default) ──
        ss.textContent = '保存中...';
        console.log('[game.js] Saving game state locally...');

        try {
            if (dosCI && typeof dosCI.persist === 'function') {
                const changes = await dosCI.persist();
                console.log('[game.js] persist() returned:', changes ? changes.byteLength : 0, 'bytes');
                if (changes && changes.byteLength > 0) {
                    ss.textContent = '已保存';
                    markGameSaved((changes.byteLength / 1024).toFixed(0));
                    window.DOS.App.showToast('游戏进度已保存 ✅', 'success');
                } else {
                    ss.textContent = '已同步';
                    window.DOS.App.showToast('游戏状态已同步 (js-dos 自动保存)', 'success');
                }
            } else {
                ss.textContent = '已保存 (自动)';
                window.DOS.App.showToast('游戏进度已自动保存', 'success');
            }
        } catch (e) {
            console.error('[game.js] Save error:', e);
            ss.textContent = '保存失败';
            window.DOS.App.showToast('保存失败: ' + e.message, 'error');
        }

        checkLocalSave();
    }

    async function saveToCloud() {
        const ss = document.getElementById('save-status');
        if (!window.DOS.App.isLoggedIn()) {
            window.DOS.App.showToast('请先登录以使用云端存档', 'warning');
            return;
        }
        ss.textContent = '上传中...';
        console.log('[game.js] Uploading save to cloud...');
        try {
            // Persist locally first to get the save data
            if (dosCI && typeof dosCI.persist === 'function') {
                await dosCI.persist();
            }
            // Read the save data from IndexedDB and upload
            const saveBytes = await getSaveState(GAME_ID);
            if (!saveBytes || saveBytes.byteLength === 0) {
                ss.textContent = '无存档数据';
                window.DOS.App.showToast('暂无存档数据可上传', 'warning');
                return;
            }
            const base64 = arrayBufferToBase64(saveBytes);
            const resp = await fetch('/api/games/' + encodeURIComponent(GAME_ID) + '/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + window.DOS.App.getToken(),
                },
                body: JSON.stringify({ save_data: base64 }),
            });
            if (resp.ok) {
                ss.textContent = '已上传 ☁️';
                markGameSaved((saveBytes.byteLength / 1024).toFixed(0));
                window.DOS.App.showToast('存档已上传到云端 ☁️', 'success');
            } else {
                const err = await resp.json().catch(() => ({}));
                throw new Error(err.error || '上传失败 (' + resp.status + ')');
            }
        } catch (e) {
            console.error('[game.js] Cloud save error:', e);
            ss.textContent = '上传失败';
            window.DOS.App.showToast('云端保存失败: ' + e.message, 'error');
        }
    }

    async function loadFromCloud() {
        const ss = document.getElementById('save-status');
        if (!window.DOS.App.isLoggedIn()) {
            window.DOS.App.showToast('请先登录以使用云端存档', 'warning');
            return;
        }
        ss.textContent = '下载中...';
        console.log('[game.js] Downloading save from cloud...');
        try {
            const resp = await fetch('/api/games/' + encodeURIComponent(GAME_ID) + '/save', {
                headers: { 'Authorization': 'Bearer ' + window.DOS.App.getToken() },
            });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                throw new Error(err.error || '下载失败 (' + resp.status + ')');
            }
            const saveBytes = await resp.arrayBuffer();
            if (saveBytes && saveBytes.byteLength > 0) {
                // Write to IndexedDB so js-dos picks it up on next restart
                await putSaveState(GAME_ID, saveBytes);
                ss.textContent = '已下载 ☁️';
                window.DOS.App.showToast('云端存档已下载，请重启游戏加载', 'success');
                markGameSaved((saveBytes.byteLength / 1024).toFixed(0));
            } else {
                ss.textContent = '云端无存档';
                window.DOS.App.showToast('云端暂无该游戏的存档', 'info');
            }
        } catch (e) {
            console.error('[game.js] Cloud load error:', e);
            ss.textContent = '下载失败';
            window.DOS.App.showToast('云端加载失败: ' + e.message, 'error');
        }
    }

    async function deleteCloudSave() {
        if (!window.DOS.App.isLoggedIn()) {
            window.DOS.App.showToast('请先登录', 'warning');
            return;
        }
        const ss = document.getElementById('save-status');
        ss.textContent = '删除中...';
        try {
            const resp = await fetch('/api/games/' + encodeURIComponent(GAME_ID) + '/save', {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + window.DOS.App.getToken() },
            });
            if (resp.ok) {
                ss.textContent = '云端存档已删除';
                window.DOS.App.showToast('云端存档已删除 ☁️', 'info');
            } else {
                throw new Error('删除失败 (' + resp.status + ')');
            }
        } catch (e) {
            console.error('[game.js] Cloud delete error:', e);
            ss.textContent = '删除失败';
            window.DOS.App.showToast('云端删除失败: ' + e.message, 'error');
        }
    }

    async function checkCloudSave() {
        if (!window.DOS.App.isLoggedIn()) return;
        try {
            const resp = await fetch('/api/games/' + encodeURIComponent(GAME_ID) + '/save', {
                headers: { 'Authorization': 'Bearer ' + window.DOS.App.getToken() },
            });
            if (resp.ok) {
                const saveBytes = await resp.arrayBuffer();
                if (saveBytes && saveBytes.byteLength > 0) {
                    const el = document.getElementById('save-status');
                    if (el) el.textContent = '☁️ 云端有存档 (' + (saveBytes.byteLength / 1024).toFixed(0) + ' KB)';
                }
            }
        } catch (e) { /* ignore — user may not be logged in or server unreachable */ }
    }

    function arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    async function deleteSave() {
        if (_saveMode === 'cloud') {
            if (!confirm('确定要删除此游戏的云端存档吗？')) return;
            await deleteCloudSave();
            checkLocalSave();
            return;
        }
        if (!confirm('确定要删除此游戏的所有本地存档吗？')) return;
        document.getElementById('save-status').textContent = '删除中...';
        await deleteLocalSaves();
        await removeSaveState(GAME_ID);
        document.getElementById('save-status').textContent = '存档已删除';
        window.DOS.App.showToast('本地存档已删除', 'info');
        checkLocalSave();
    }

    async function restartGame() {
        if (!dosProps) return;
        if (!confirm('确定要重新开始吗？未保存的进度会丢失。')) return;
        document.getElementById('save-status').textContent = '重启中...';
        if (dosProps) {
            try { await dosProps.stop(); } catch (e) { /* */ }
            dosProps = null; dosCI = null;
        }
        await new Promise(r => setTimeout(r, 300));
        await deleteLocalSaves();
        await removeSaveState(GAME_ID);
        window.location.reload();
    }

    // ═══════════════════════════════════════════════════════════════
    //  Metadata
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
            if (data.description_zh) html += `<p style="font-size:0.85rem;line-height:1.7;color:var(--text);">${data.description_zh}</p>`;
            if (data.description_en && !data.description_zh) html += `<p style="font-size:0.85rem;line-height:1.7;color:var(--text);">${data.description_en}</p>`;
            if (data.wikipedia_url) html += `<a href="${data.wikipedia_url}" target="_blank" rel="noopener" class="sidebar-link" style="margin-top:8px;">📖 Wikipedia →</a>`;
            if (html) { content.innerHTML = html; card.style.display = 'block'; }
        } catch (e) { /* */ }
    }

    // ═══════════════════════════════════════════════════════════════
    //  Cleanup
    // ═══════════════════════════════════════════════════════════════

    window.addEventListener('beforeunload', () => {
        if (bundleBlobUrl) { URL.revokeObjectURL(bundleBlobUrl); bundleBlobUrl = null; }
        if (dosProps) { try { dosProps.stop(); } catch (e) { /* */ } }
    });

    // Expose for HTML onclick handlers
    window.actionPickLocalFile = actionPickLocalFile;
    window.actionDownloadFromServer = actionDownloadFromServer;
    window.actionClearLocalFile = actionClearLocalFile;

    // ═══════════════════════════════════════════════════════════════
    //  Screenshot API (exposed for chat.js AI vision feature)
    // ═══════════════════════════════════════════════════════════════

    /**
     * Capture a screenshot of the current game screen.
     *
     * Uses js-dos's native ci.screenshot() which properly reads the WebGL
     * drawing buffer (unlike canvas.toDataURL() which returns black for
     * WebGL canvases with preserveDrawingBuffer=false).
     *
     * Falls back to direct canvas read, then to the last good screenshot.
     *
     * @returns {Promise<string|null>} Base64-encoded JPEG, or null on failure
     */
    async function captureGameScreenshot() {
        // ── Method 1: js-dos native ci.screenshot() ──
        if (dosCI && typeof dosCI.screenshot === 'function') {
            try {
                const result = await dosCI.screenshot();
                if (result) {
                    // ci.screenshot() may return ImageData, a data URL, or a canvas
                    let dataUrl;
                    if (typeof result === 'string') {
                        // Already a data URL
                        dataUrl = result;
                    } else if (result instanceof ImageData) {
                        // Convert ImageData to data URL via an offscreen canvas
                        const c = document.createElement('canvas');
                        c.width = result.width;
                        c.height = result.height;
                        const ctx = c.getContext('2d');
                        ctx.putImageData(result, 0, 0);
                        dataUrl = c.toDataURL('image/jpeg', 0.85);
                    } else if (result instanceof HTMLCanvasElement) {
                        dataUrl = result.toDataURL('image/jpeg', 0.85);
                    } else if (result && result.data && result.width) {
                        // ImageData-like object
                        const c = document.createElement('canvas');
                        c.width = result.width;
                        c.height = result.height;
                        const ctx = c.getContext('2d');
                        ctx.putImageData(new ImageData(
                            new Uint8ClampedArray(result.data),
                            result.width,
                            result.height
                        ), 0, 0);
                        dataUrl = c.toDataURL('image/jpeg', 0.85);
                    }

                    if (dataUrl && dataUrl.startsWith('data:image/')) {
                        const base64 = dataUrl.split(',')[1];
                        if (base64 && base64.length > 500) {
                            console.log('[game.js] Screenshot OK via ci.screenshot(), size:', base64.length);
                            lastGoodScreenshot = base64;
                            return base64;
                        }
                    }
                }
                console.warn('[game.js] ci.screenshot() returned empty/black result, trying fallback...');
            } catch (e) {
                console.warn('[game.js] ci.screenshot() failed:', e.message, ', trying fallback...');
            }
        }

        // ── Method 2: Direct canvas read ──
        // Find the actual rendering canvas (js-dos may create multiple canvases)
        const container = document.getElementById('dos-container');
        if (container) {
            const canvases = container.querySelectorAll('canvas');
            // Try each canvas, pick the one with non-trivial content
            for (const canvas of canvases) {
                try {
                    if (canvas.width < 16 || canvas.height < 16) continue;
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                    const base64 = dataUrl.split(',')[1];
                    if (base64 && base64.length > 500) {
                        // Check if this is likely a black/blank image
                        // A truly blank JPEG is typically <300 bytes
                        console.log('[game.js] Screenshot OK via canvas.toDataURL(), size:', base64.length, 'canvas:', canvas.width + 'x' + canvas.height);
                        lastGoodScreenshot = base64;
                        return base64;
                    }
                } catch (e) {
                    // Tainted canvas or other error — skip this canvas
                    continue;
                }
            }
        }

        // ── Method 3: Fallback to last good screenshot ──
        if (lastGoodScreenshot) {
            console.log('[game.js] Returning cached last good screenshot, size:', lastGoodScreenshot.length);
            return lastGoodScreenshot;
        }

        console.warn('[game.js] All screenshot methods failed');
        return null;
    }

    // Expose on global namespace
    window.DOS = window.DOS || {};
    window.DOS.Game = {
        captureScreenshot: captureGameScreenshot,
        get dosCI() { return dosCI; },
        get dosProps() { return dosProps; },
        get isPaused() { return isPaused; },
        /** Pause emulator (releases keyboard capture for chat input) */
        pauseForInput: () => {
            if (dosProps && !isPaused) {
                dosProps.setPaused(true);
                _inputPaused = true;
            }
        },
        /** Resume emulator after chat input done */
        resumeAfterInput: () => {
            if (dosProps && _inputPaused) {
                dosProps.setPaused(false);
                _inputPaused = false;
            }
        },
    };
})();
