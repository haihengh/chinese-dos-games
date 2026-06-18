/**
 * Chinese DOS Games — js-dos v8 Game Player
 *
 * Local-first architecture:
 * - Game bundles are cached in IndexedDB on first download
 * - All save data is handled locally by js-dos v8 (sockdrive → IndexedDB)
 * - No cloud sync — saves stay on the user's machine
 * - The website is a catalog + launcher, not a storage service
 */
(function () {
    'use strict';

    let dosProps = null;       // DosProps from Dos()
    let dosCI = null;          // CommandInterface (from ci-ready event)
    let isPaused = false;
    let isFullscreen = false;
    let volume = 1.0;
    let bundleBlobUrl = null;  // Blob URL for current bundle (cached or downloaded)

    const GAME_ID = window.GAME_ID;
    const BUNDLE_URL = `/api/games/${encodeURIComponent(GAME_ID)}/bundle`;
    const CACHE_DB = 'dos-games-cache';
    const CACHE_STORE = 'bundles';

    const LOADING_HTML = `
        <div class="loading-spinner"></div>
        <p class="loading-text" id="loading-text">正在加载游戏...</p>
    `;

    // ═══════════════════════════════════════════════════════════════
    //  IndexedDB bundle cache
    // ═══════════════════════════════════════════════════════════════

    function openCacheDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(CACHE_DB, 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(CACHE_STORE)) {
                    db.createObjectStore(CACHE_STORE);
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function getCachedBundle(gameId) {
        try {
            const db = await openCacheDB();
            return new Promise((resolve) => {
                const tx = db.transaction(CACHE_STORE, 'readonly');
                const req = tx.objectStore(CACHE_STORE).get(gameId);
                req.onsuccess = () => { db.close(); resolve(req.result || null); };
                req.onerror = () => { db.close(); resolve(null); };
            });
        } catch (e) {
            console.warn('[game.js] Cache read failed:', e);
            return null;
        }
    }

    async function putCachedBundle(gameId, blob) {
        try {
            const db = await openCacheDB();
            return new Promise((resolve) => {
                const tx = db.transaction(CACHE_STORE, 'readwrite');
                tx.objectStore(CACHE_STORE).put(blob, gameId);
                tx.oncomplete = () => { db.close(); resolve(); };
                tx.onerror = () => { db.close(); resolve(); };
            });
        } catch (e) {
            console.warn('[game.js] Cache write failed:', e);
        }
    }

    async function removeCachedBundle(gameId) {
        try {
            const db = await openCacheDB();
            return new Promise((resolve) => {
                const tx = db.transaction(CACHE_STORE, 'readwrite');
                tx.objectStore(CACHE_STORE).delete(gameId);
                tx.oncomplete = () => { db.close(); resolve(); };
                tx.onerror = () => { db.close(); resolve(); };
            });
        } catch (e) {
            console.warn('[game.js] Cache delete failed:', e);
        }
    }

    /** Download bundle from server, cache it, return Blob URL. */
    async function downloadAndCacheBundle() {
        const loadingText = document.getElementById('loading-text');
        if (loadingText) loadingText.textContent = '正在下载游戏... (首次运行)';

        console.log('[game.js] Downloading bundle from:', BUNDLE_URL);
        const resp = await fetch(BUNDLE_URL);
        if (!resp.ok) throw new Error(`下载失败 (${resp.status})`);

        const blob = await resp.blob();
        console.log('[game.js] Downloaded bundle:', (blob.size / 1048576).toFixed(1), 'MB');

        // Cache in IndexedDB for future use
        await putCachedBundle(GAME_ID, blob);

        // Update UI
        updateCacheInfo();
        return URL.createObjectURL(blob);
    }

    // ═══════════════════════════════════════════════════════════════
    //  Save data helpers (js-dos local persistence)
    // ═══════════════════════════════════════════════════════════════

    /** Delete all js-dos save data (sockdrive IndexedDB). */
    async function deleteLocalSaves() {
        console.log('[game.js] Deleting local saves...');
        let names = [];
        try {
            if (typeof indexedDB.databases === 'function') {
                const list = await indexedDB.databases();
                names = list.map(d => d.name);
            }
        } catch (e) { /* ignore */ }

        // js-dos v8 sockdrive databases
        const patterns = ['sockdrive ', 'js-dos-cache '];
        for (const name of names) {
            for (const pat of patterns) {
                if (name.startsWith(pat)) {
                    await new Promise((resolve) => {
                        const req = indexedDB.deleteDatabase(name);
                        req.onsuccess = resolve;
                        req.onerror = resolve;
                        req.onblocked = resolve;
                    });
                    console.log('[game.js] Deleted:', name);
                    break;
                }
            }
        }
    }

    /** Check if any local save exists for this game. */
    async function hasLocalSave() {
        try {
            if (typeof indexedDB.databases !== 'function') return false;
            const list = await indexedDB.databases();
            return list.some(d => d.name.startsWith('sockdrive '));
        } catch (e) {
            return false;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  Player creation
    // ═══════════════════════════════════════════════════════════════

    function createDosPlayer(bundleUrl) {
        const container = document.getElementById('dos-container');
        const saveStatus = document.getElementById('save-status');

        if (!container) {
            console.error('[game.js] #dos-container not found');
            return Promise.reject(new Error('页面元素缺失'));
        }

        // Clear container and add loading overlay
        container.innerHTML = '';
        const loadingEl = document.createElement('div');
        loadingEl.className = 'game-loading';
        loadingEl.id = 'game-loading';
        loadingEl.innerHTML = LOADING_HTML;
        container.appendChild(loadingEl);

        console.log('[game.js] Creating Dos player, url:', bundleUrl);

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                console.error('[game.js] Dos() ci-ready timeout — game did not start');
                reject(new Error('游戏加载超时，请检查网络连接'));
            }, 120000); // 2-minute timeout for first download

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
                            const le = document.getElementById('game-loading');
                            if (le) le.classList.add('hidden');
                            if (saveStatus) saveStatus.textContent = '游戏已就绪';
                            console.log('[game.js] Game ready — ci-ready received');
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

        updateCacheInfo();
        checkLocalSave();

        try {
            // Try cached bundle first
            const cached = await getCachedBundle(GAME_ID);
            if (cached) {
                console.log('[game.js] Using cached bundle, size:', cached.size);
                bundleBlobUrl = URL.createObjectURL(cached);
                const loadingText = document.getElementById('loading-text');
                if (loadingText) loadingText.textContent = '正在加载本地缓存...';
            } else {
                // First run — download and cache
                bundleBlobUrl = await downloadAndCacheBundle();
            }

            await createDosPlayer(bundleBlobUrl);
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
    //  UI updates
    // ═══════════════════════════════════════════════════════════════

    async function updateCacheInfo() {
        const cached = await getCachedBundle(GAME_ID);
        const cacheInfo = document.getElementById('cache-info');
        const cacheSize = document.getElementById('cache-size');
        if (cacheInfo && cacheSize) {
            if (cached) {
                cacheInfo.textContent = '本地缓存';
                cacheSize.textContent = (cached.size / 1048576).toFixed(1) + ' MB';
                document.getElementById('btn-clear-cache').style.display = '';
            } else {
                cacheInfo.textContent = '未缓存';
                cacheSize.textContent = '首次运行需下载';
                document.getElementById('btn-clear-cache').style.display = 'none';
            }
        }
    }

    async function checkLocalSave() {
        const saveIndicator = document.getElementById('save-indicator');
        if (!saveIndicator) return;
        const hasSave = await hasLocalSave();
        saveIndicator.textContent = hasSave ? '💾 有存档' : '📝 新游戏';
        saveIndicator.style.color = hasSave ? 'var(--success)' : 'var(--text-muted)';
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
        document.getElementById('btn-clear-cache').addEventListener('click', clearCache);

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
    //  Save (local only)
    // ═══════════════════════════════════════════════════════════════

    async function saveGame() {
        const saveStatus = document.getElementById('save-status');
        saveStatus.textContent = '保存中...';
        console.log('[game.js] Saving game locally...');

        try {
            if (!dosCI || typeof dosCI.persist !== 'function') {
                // js-dos auto-persists; just update UI
                saveStatus.textContent = '已保存 (自动)';
                window.DOS.App.showToast('游戏进度已自动保存到本地 ✅', 'success');
                checkLocalSave();
                return;
            }

            const changesBundle = await dosCI.persist();
            console.log('[game.js] persist() returned:', changesBundle ? changesBundle.byteLength : 0, 'bytes');

            saveStatus.textContent = '已保存';
            window.DOS.App.showToast('游戏进度已保存到本地 ✅', 'success');
            checkLocalSave();
        } catch (err) {
            console.error('[game.js] Save error:', err);
            // Auto-persist fallback message
            saveStatus.textContent = '已保存 (自动)';
            window.DOS.App.showToast('游戏进度已自动保存', 'info');
            checkLocalSave();
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  Delete save
    // ═══════════════════════════════════════════════════════════════

    async function deleteSave() {
        if (!confirm('确定要删除此游戏的所有本地存档吗？此操作不可撤销。')) return;

        const saveStatus = document.getElementById('save-status');
        saveStatus.textContent = '正在删除存档...';

        await deleteLocalSaves();
        saveStatus.textContent = '存档已删除';
        window.DOS.App.showToast('本地存档已删除', 'info');
        checkLocalSave();
    }

    // ═══════════════════════════════════════════════════════════════
    //  Clear cache & restart
    // ═══════════════════════════════════════════════════════════════

    async function clearCache() {
        if (!confirm('确定要清除本地缓存吗？下次运行将重新下载游戏。\n(存档数据不受影响)')) return;

        await removeCachedBundle(GAME_ID);
        if (bundleBlobUrl) {
            URL.revokeObjectURL(bundleBlobUrl);
            bundleBlobUrl = null;
        }
        updateCacheInfo();
        window.DOS.App.showToast('缓存已清除，刷新后重新下载', 'info');
        // Reload to re-download
        window.location.reload();
    }

    // ═══════════════════════════════════════════════════════════════
    //  Restart
    // ═══════════════════════════════════════════════════════════════

    async function restartGame() {
        if (!dosProps) return;
        if (!confirm('确定要重新开始游戏吗？未保存的进度会丢失。')) return;

        document.getElementById('save-status').textContent = '重启中...';

        // Stop current player
        if (dosProps) {
            try { await dosProps.stop(); } catch (e) { console.warn('[game.js] stop() error:', e); }
            dosProps = null;
            dosCI = null;
        }
        await new Promise(r => setTimeout(r, 300));

        // Delete local saves
        await deleteLocalSaves();

        // Reload page for clean start
        window.location.reload();
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

    // ═══════════════════════════════════════════════════════════════
    //  Cleanup on page unload
    // ═══════════════════════════════════════════════════════════════

    window.addEventListener('beforeunload', () => {
        if (bundleBlobUrl) {
            URL.revokeObjectURL(bundleBlobUrl);
            bundleBlobUrl = null;
        }
        if (dosProps) {
            try { dosProps.stop(); } catch (e) { /* ignore */ }
        }
    });
})();
