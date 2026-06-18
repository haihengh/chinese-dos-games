/**
 * Chinese DOS Games — js-dos v8 Game Player
 *
 * Loads game bundles from the user's local machine (File System Access API)
 * with server download as fallback.  All save data stays in the browser
 * (js-dos v8 sockdrive → IndexedDB) — nothing uploaded to any server.
 */
(function () {
    'use strict';

    let dosProps = null;
    let dosCI = null;
    let isPaused = false;
    let isFullscreen = false;
    let volume = 1.0;
    let bundleBlobUrl = null;

    const GAME_ID = window.GAME_ID;
    const BUNDLE_URL = `/api/games/${encodeURIComponent(GAME_ID)}/bundle`;
    const CACHE_DB = 'dos-games-cache';
    const STORE_BUNDLES = 'bundles';
    const STORE_HANDLES = 'file-handles';   // FileSystemFileHandle store

    const LOADING_HTML = `
        <div class="loading-spinner"></div>
        <p class="loading-text" id="loading-text">正在加载游戏...</p>
    `;

    // ═══════════════════════════════════════════════════════════════
    //  IndexedDB helpers
    // ═══════════════════════════════════════════════════════════════

    function openCacheDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(CACHE_DB, 2);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_BUNDLES)) {
                    db.createObjectStore(STORE_BUNDLES);
                }
                if (!db.objectStoreNames.contains(STORE_HANDLES)) {
                    db.createObjectStore(STORE_HANDLES);
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    // ── Bundle blob cache (server download fallback) ──

    async function getCachedBundle(gameId) {
        try {
            const db = await openCacheDB();
            return new Promise((resolve) => {
                const tx = db.transaction(STORE_BUNDLES, 'readonly');
                const req = tx.objectStore(STORE_BUNDLES).get(gameId);
                req.onsuccess = () => { db.close(); resolve(req.result || null); };
                req.onerror = () => { db.close(); resolve(null); };
            });
        } catch (e) { return null; }
    }

    async function putCachedBundle(gameId, blob) {
        try {
            const db = await openCacheDB();
            return new Promise((resolve) => {
                const tx = db.transaction(STORE_BUNDLES, 'readwrite');
                tx.objectStore(STORE_BUNDLES).put(blob, gameId);
                tx.oncomplete = () => { db.close(); resolve(); };
                tx.onerror = () => { db.close(); resolve(); };
            });
        } catch (e) { /* ignore */ }
    }

    async function removeCachedBundle(gameId) {
        try {
            const db = await openCacheDB();
            return new Promise((resolve) => {
                const tx = db.transaction(STORE_BUNDLES, 'readwrite');
                tx.objectStore(STORE_BUNDLES).delete(gameId);
                tx.oncomplete = () => { db.close(); resolve(); };
                tx.onerror = () => { db.close(); resolve(); };
            });
        } catch (e) { /* ignore */ }
    }

    // ── FileSystemFileHandle persistence ──

    /** Store a FileSystemFileHandle for this game. */
    async function putFileHandle(gameId, handle) {
        try {
            const db = await openCacheDB();
            return new Promise((resolve) => {
                const tx = db.transaction(STORE_HANDLES, 'readwrite');
                tx.objectStore(STORE_HANDLES).put(handle, gameId);
                tx.oncomplete = () => { db.close(); resolve(); };
                tx.onerror = () => { db.close(); resolve(); };
            });
        } catch (e) { /* ignore */ }
    }

    /** Retrieve the stored FileSystemFileHandle, or null. */
    async function getFileHandle(gameId) {
        try {
            const db = await openCacheDB();
            return new Promise((resolve) => {
                const tx = db.transaction(STORE_HANDLES, 'readonly');
                const req = tx.objectStore(STORE_HANDLES).get(gameId);
                req.onsuccess = () => { db.close(); resolve(req.result || null); };
                req.onerror = () => { db.close(); resolve(null); };
            });
        } catch (e) { return null; }
    }

    async function removeFileHandle(gameId) {
        try {
            const db = await openCacheDB();
            return new Promise((resolve) => {
                const tx = db.transaction(STORE_HANDLES, 'readwrite');
                tx.objectStore(STORE_HANDLES).delete(gameId);
                tx.oncomplete = () => { db.close(); resolve(); };
                tx.onerror = () => { db.close(); resolve(); };
            });
        } catch (e) { /* ignore */ }
    }

    // ── Local save helpers ──

    async function deleteLocalSaves() {
        console.log('[game.js] Deleting local saves...');
        let names = [];
        try {
            if (typeof indexedDB.databases === 'function') {
                names = (await indexedDB.databases()).map(d => d.name);
            }
        } catch (e) { /* ignore */ }
        for (const name of names) {
            if (name.startsWith('sockdrive ') || name.startsWith('js-dos-cache ')) {
                await new Promise((r) => {
                    const req = indexedDB.deleteDatabase(name);
                    req.onsuccess = r; req.onerror = r; req.onblocked = r;
                });
                console.log('[game.js] Deleted:', name);
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
    //  File System Access API — load game from local machine
    // ═══════════════════════════════════════════════════════════════

    /** Let the user pick a .jsdos or .zip file from their local machine. */
    async function pickLocalFile() {
        if (!window.showOpenFilePicker) {
            window.DOS.App.showToast('你的浏览器不支持文件系统访问，请使用 Chrome 或 Edge', 'error');
            return null;
        }
        try {
            const [handle] = await window.showOpenFilePicker({
                types: [{
                    description: 'js-dos Bundle',
                    accept: { 'application/zip': ['.jsdos', '.zip'] },
                }],
            });
            console.log('[game.js] User picked:', handle.name);
            return handle;
        } catch (e) {
            if (e.name !== 'AbortError') {
                console.error('[game.js] File picker error:', e);
            }
            return null;
        }
    }

    /** Read a Blob from a FileSystemFileHandle (requests permission if needed). */
    async function readFileFromHandle(handle) {
        const opts = { mode: 'read' };
        if (await handle.queryPermission(opts) !== 'granted') {
            const granted = await handle.requestPermission(opts);
            if (!granted) throw new Error('文件读取权限被拒绝');
        }
        const file = await handle.getFile();
        console.log('[game.js] Read local file:', file.name, (file.size / 1048576).toFixed(1), 'MB');
        return file;  // File extends Blob
    }

    /** Check if we have a stored handle and can still read from it. */
    async function tryStoredHandle() {
        const handle = await getFileHandle(GAME_ID);
        if (!handle) return null;
        try {
            return await readFileFromHandle(handle);
        } catch (e) {
            console.warn('[game.js] Stored handle no longer valid:', e.message);
            await removeFileHandle(GAME_ID);
            return null;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  Bundle sources
    // ═══════════════════════════════════════════════════════════════

    /** Download bundle from server, cache it, return Blob URL. */
    async function downloadFromServer() {
        const lt = document.getElementById('loading-text');
        if (lt) lt.textContent = '正在从服务器下载游戏...';
        console.log('[game.js] Downloading from server:', BUNDLE_URL);
        const resp = await fetch(BUNDLE_URL);
        if (!resp.ok) throw new Error(`服务器下载失败 (${resp.status})`);
        const blob = await resp.blob();
        console.log('[game.js] Downloaded:', (blob.size / 1048576).toFixed(1), 'MB');
        await putCachedBundle(GAME_ID, blob);
        return URL.createObjectURL(blob);
    }

    /** Get a bundle URL — priority: local file > IndexedDB cache > server. */
    async function getBundleUrl() {
        // 1. Try stored local file handle
        const localFile = await tryStoredHandle();
        if (localFile) {
            document.getElementById('source-indicator').textContent = '📁 本地文件';
            return URL.createObjectURL(localFile);
        }

        // 2. Try IndexedDB cache (from previous server download)
        const cached = await getCachedBundle(GAME_ID);
        if (cached) {
            document.getElementById('source-indicator').textContent = '💾 浏览器缓存';
            console.log('[game.js] Using cached bundle:', (cached.size / 1048576).toFixed(1), 'MB');
            return URL.createObjectURL(cached);
        }

        // 3. No local file, no cache — must download
        return null;
    }

    // ═══════════════════════════════════════════════════════════════
    //  Player
    // ═══════════════════════════════════════════════════════════════

    function createDosPlayer(bundleUrl) {
        const container = document.getElementById('dos-container');
        const saveStatus = document.getElementById('save-status');
        if (!container) return Promise.reject(new Error('页面元素缺失'));

        container.innerHTML = '';
        const le = document.createElement('div');
        le.className = 'game-loading';
        le.id = 'game-loading';
        le.innerHTML = LOADING_HTML;
        container.appendChild(le);

        console.log('[game.js] Dos() with:', bundleUrl);

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('游戏加载超时，请检查文件或网络'));
            }, 120000);

            try {
                dosProps = Dos(container, {
                    url: bundleUrl,
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

        updateStorageInfo();
        checkLocalSave();

        try {
            let url = await getBundleUrl();

            if (!url) {
                // No local file, no cache — show the "first run" UI
                showFirstRunUI();
                return;
            }

            bundleBlobUrl = url;
            await createDosPlayer(url);
            hideFirstRunUI();
        } catch (err) {
            console.error('[game.js] Startup failed:', err);
            const le = document.getElementById('game-loading');
            if (le) {
                le.innerHTML = `<p style="color:var(--danger)">❌ 加载失败</p>
                    <p style="color:var(--text-muted);">${err.message || '未知错误'}</p>
                    <button class="btn btn-primary" onclick="location.reload()">重试</button>`;
                le.classList.remove('hidden');
            }
        }

        setupControls();
        loadMetadata();
    });

    // ═══════════════════════════════════════════════════════════════
    //  First-run UI (no local file, no cache)
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
    //  UI actions (called from onclick in HTML)
    // ═══════════════════════════════════════════════════════════════

    async function actionPickLocalFile() {
        const handle = await pickLocalFile();
        if (!handle) return;

        const file = await readFileFromHandle(handle);
        await putFileHandle(GAME_ID, handle);
        updateStorageInfo();

        if (bundleBlobUrl) URL.revokeObjectURL(bundleBlobUrl);
        bundleBlobUrl = URL.createObjectURL(file);

        try {
            await createDosPlayer(bundleBlobUrl);
            hideFirstRunUI();
        } catch (err) {
            console.error('[game.js] Local file load failed:', err);
            window.DOS.App.showToast('文件加载失败: ' + err.message, 'error');
        }
    }

    async function actionDownloadFromServer() {
        try {
            bundleBlobUrl = await downloadFromServer();
            updateStorageInfo();
            await createDosPlayer(bundleBlobUrl);
            hideFirstRunUI();
        } catch (err) {
            console.error('[game.js] Server download failed:', err);
            window.DOS.App.showToast('下载失败: ' + err.message, 'error');
        }
    }

    async function actionClearLocalFile() {
        await removeFileHandle(GAME_ID);
        updateStorageInfo();
        window.DOS.App.showToast('已清除本地文件关联，下次将提示选择文件', 'info');
    }

    // ═══════════════════════════════════════════════════════════════
    //  UI update
    // ═══════════════════════════════════════════════════════════════

    async function updateStorageInfo() {
        const handle = await getFileHandle(GAME_ID);
        const cached = await getCachedBundle(GAME_ID);

        const srcEl = document.getElementById('source-indicator');
        const detailEl = document.getElementById('source-detail');

        if (handle) {
            if (srcEl) srcEl.textContent = '📁 本地文件';
            // Try to read file name from handle
            try {
                const opts = { mode: 'read' };
                if (await handle.queryPermission(opts) === 'granted') {
                    const file = await handle.getFile();
                    if (detailEl) detailEl.textContent = file.name + ' · ' + (file.size / 1048576).toFixed(1) + ' MB';
                } else {
                    if (detailEl) detailEl.textContent = '需要文件读取权限';
                }
            } catch (e) {
                if (detailEl) detailEl.textContent = '文件已不可用';
            }
            document.getElementById('btn-clear-local').style.display = '';
        } else if (cached) {
            if (srcEl) srcEl.textContent = '💾 浏览器缓存';
            if (detailEl) detailEl.textContent = (cached.size / 1048576).toFixed(1) + ' MB · 服务器下载';
            document.getElementById('btn-clear-local').style.display = 'none';
        } else {
            if (srcEl) srcEl.textContent = '☁️ 需要下载';
            if (detailEl) detailEl.textContent = '首次运行需下载或选择本地文件';
            document.getElementById('btn-clear-local').style.display = 'none';
        }
    }

    async function checkLocalSave() {
        const el = document.getElementById('save-indicator');
        if (!el) return;
        const has = await hasLocalSave();
        el.textContent = has ? '💾 有存档' : '📝 新游戏';
        el.style.color = has ? 'var(--success)' : 'var(--text-muted)';
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
            if (e.key === 'F11' || (e.key === 'Enter' && e.altKey)) {
                e.preventDefault(); toggleFullscreen();
            }
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault(); saveGame();
            }
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
        ss.textContent = '保存中...';
        try {
            if (dosCI && typeof dosCI.persist === 'function') {
                await dosCI.persist();
            }
            ss.textContent = '已保存';
            window.DOS.App.showToast('游戏进度已保存到本地 ✅', 'success');
        } catch (e) {
            ss.textContent = '已保存 (自动)';
            window.DOS.App.showToast('游戏进度已自动保存', 'info');
        }
        checkLocalSave();
    }

    async function deleteSave() {
        if (!confirm('确定要删除此游戏的所有本地存档吗？')) return;
        document.getElementById('save-status').textContent = '删除中...';
        await deleteLocalSaves();
        document.getElementById('save-status').textContent = '存档已删除';
        window.DOS.App.showToast('本地存档已删除', 'info');
        checkLocalSave();
    }

    async function restartGame() {
        if (!dosProps) return;
        if (!confirm('确定要重新开始吗？未保存的进度会丢失。')) return;
        document.getElementById('save-status').textContent = '重启中...';
        if (dosProps) {
            try { await dosProps.stop(); } catch (e) { /* ignore */ }
            dosProps = null; dosCI = null;
        }
        await new Promise(r => setTimeout(r, 300));
        await deleteLocalSaves();
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
        } catch (e) { /* ignore */ }
    }

    // ═══════════════════════════════════════════════════════════════
    //  Cleanup
    // ═══════════════════════════════════════════════════════════════

    window.addEventListener('beforeunload', () => {
        if (bundleBlobUrl) { URL.revokeObjectURL(bundleBlobUrl); bundleBlobUrl = null; }
        if (dosProps) { try { dosProps.stop(); } catch (e) { /* ignore */ } }
    });
})();
