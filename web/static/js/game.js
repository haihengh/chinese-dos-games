/**
 * Chinese DOS Games — js-dos v8 Game Player
 *
 * Saves work because we always use the same bundle URL for Dos().
 * Local files / cached downloads are served at that URL via the
 * browser's Cache API, so js-dos sees a consistent URL and can
 * match existing sockdrive IndexedDB data to the right game.
 *
 * File System Access API lets users pick a .jsdos/.zip from their
 * local machine.  Server download is the fallback.
 */
(function () {
    'use strict';

    let dosProps = null;
    let dosCI = null;
    let isPaused = false;
    let isFullscreen = false;
    let volume = 1.0;
    let bundleBlobUrl = null;  // Track Blob URL for cleanup

    const GAME_ID = window.GAME_ID;
    const BUNDLE_URL = `/api/games/${encodeURIComponent(GAME_ID)}/bundle`;
    const CACHE_NAME = 'dos-games-v1';
    const CACHE_DB = 'dos-games-cache';
    const STORE_BUNDLES = 'bundles';
    const STORE_HANDLES = 'file-handles';
    const STORE_SAVES = 'saves';

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
            if (!cached) {
                // Cache API unavailable — fall back to Blob URL
                // (saves may not persist because URL changes each session)
                console.warn('[game.js] Cache API unavailable, using Blob URL (saves may not persist)');
                return URL.createObjectURL(localFile);
            }
            return BUNDLE_URL;
        }

        // 2. Try IndexedDB backup (survives Cache API eviction)
        const idbBlob = await idbGetBundle(GAME_ID);
        if (idbBlob) {
            const cached = await cacheBundleAtUrl(idbBlob);
            const src = document.getElementById('source-indicator');
            const det = document.getElementById('source-detail');
            if (src) src.textContent = '💾 浏览器缓存';
            if (det) det.textContent = (idbBlob.size / 1048576).toFixed(1) + ' MB';
            if (!cached) {
                return URL.createObjectURL(idbBlob);
            }
            return BUNDLE_URL;
        }

        // 3. Nothing available — need user action (first-run UI)
        return null;
    }

    // ═══════════════════════════════════════════════════════════════
    //  Player — always uses BUNDLE_URL (consistent!)
    // ═══════════════════════════════════════════════════════════════

    function createDosPlayer(bundleUrl) {
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
                showFirstRunUI();
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

        const url = cached ? BUNDLE_URL : URL.createObjectURL(file);
        try {
            await createDosPlayer(url);
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

            // If Cache API succeeded, use BUNDLE_URL (consistent → saves work).
            // Otherwise use Blob URL (game works, but saves may not persist).
            const url = cached ? BUNDLE_URL : URL.createObjectURL(blob);

            await createDosPlayer(url);
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
        } else {
            el.textContent = '📝 新游戏';
            el.style.color = 'var(--text-muted)';
            if (hint) hint.textContent = '在游戏中保存后，点击下方 💾 保存按钮';
        }
    }

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
        document.getElementById('btn-delete-save').addEventListener('click', deleteSave);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'F11' || (e.key === 'Enter' && e.altKey)) { e.preventDefault(); toggleFullscreen(); }
            if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveGame(); }
        });
        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement) { isFullscreen = false; updateFullscreenButton(); }
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

    async function saveGame() {
        const ss = document.getElementById('save-status');
        if (!dosProps) {
            window.DOS.App.showToast('游戏尚未加载', 'warning');
            return;
        }

        ss.textContent = '保存中...';
        console.log('[game.js] Saving — dosCI:', !!dosCI, 'persist:', typeof (dosCI || {}).persist);

        try {
            if (dosCI && typeof dosCI.persist === 'function') {
                const changes = await dosCI.persist();
                console.log('[game.js] persist() returned:', changes ? changes.byteLength : 0, 'bytes');
                if (changes && changes.byteLength > 0) {
                    await putSaveState(GAME_ID, changes);
                    ss.textContent = '已保存 (' + (changes.byteLength / 1024).toFixed(0) + ' KB)';
                    window.DOS.App.showToast('游戏进度已保存 ✅', 'success');
                } else {
                    // js-dos auto-persists to sockdrive
                    ss.textContent = '已同步';
                    window.DOS.App.showToast('游戏状态已同步 (js-dos 自动保存)', 'success');
                }
            } else {
                ss.textContent = '已保存 (自动)';
                window.DOS.App.showToast('游戏进度由 js-dos 自动保存到本地', 'success');
            }
        } catch (e) {
            console.error('[game.js] Save error:', e);
            ss.textContent = '保存失败';
            window.DOS.App.showToast('保存失败: ' + e.message, 'error');
        }

        checkLocalSave();
    }

    async function deleteSave() {
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
})();
