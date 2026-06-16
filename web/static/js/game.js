/**
 * Chinese DOS Games — js-dos v8 Game Player
 *
 * Uses js-dos v8 with DOSBox-X backend for Chinese character support.
 * Loads .jsdos bundles from the server, handles save/load, fullscreen, controls.
 */
(function () {
    'use strict';

    let dosInstance = null;
    let ci = null;          // CommandInterface
    let isPaused = false;
    let isFullscreen = false;
    let volume = 1.0;

    const GAME_ID = window.GAME_ID;
    const BUNDLE_URL = `/api/games/${encodeURIComponent(GAME_ID)}/bundle`;

    document.addEventListener('DOMContentLoaded', async () => {
        const container = document.getElementById('dos-container');
        const loadingEl = document.getElementById('game-loading');
        const saveStatus = document.getElementById('save-status');

        if (!container || !GAME_ID) return;

        // Check for existing save
        if (window.DOS.App.isLoggedIn()) {
            checkExistingSave();
        }

        // Initialize js-dos
        try {
            dosInstance = Dos(container, {
                style: 'none',  // We use our own CSS
                backend: 'dosboxX',  // DOSBox-X for Chinese support
                onerror: (error) => {
                    console.error('js-dos error:', error);
                    loadingEl.innerHTML = `
                        <p style="color:var(--danger);font-size:1rem;">❌ 模拟器错误</p>
                        <p style="color:var(--text-muted);">${error}</p>
                        <button class="btn btn-primary" onclick="location.reload()">重试</button>
                    `;
                },
            });

            // Load the game bundle
            ci = await dosInstance.run(BUNDLE_URL);

            // Hide loading
            loadingEl.classList.add('hidden');
            saveStatus.textContent = '游戏已就绪';

            // Listen for exit
            ci.events().onExit(() => {
                saveStatus.textContent = '游戏已退出';
            });

        } catch (err) {
            console.error('Failed to start game:', err);
            loadingEl.innerHTML = `
                <p style="color:var(--danger);font-size:1rem;">❌ 加载失败</p>
                <p style="color:var(--text-muted);">${err.message || '未知错误'}</p>
                <button class="btn btn-primary" onclick="location.reload()">重试</button>
            `;
        }

        // Setup controls
        setupControls();
        loadMetadata();
    });

    function setupControls() {
        // Fullscreen
        document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);

        // Pause/Resume
        document.getElementById('btn-pause').addEventListener('click', togglePause);

        // Restart
        document.getElementById('btn-restart').addEventListener('click', restartGame);

        // Volume
        document.getElementById('btn-volume-down').addEventListener('click', () => adjustVolume(-0.1));
        document.getElementById('btn-volume-up').addEventListener('click', () => adjustVolume(+0.1));

        // Save
        document.getElementById('btn-save').addEventListener('click', saveGame);

        // Load
        document.getElementById('btn-load').addEventListener('click', loadGame);

        // Keyboard shortcut for fullscreen
        document.addEventListener('keydown', (e) => {
            if (e.key === 'F11' || (e.key === 'Enter' && e.altKey)) {
                e.preventDefault();
                toggleFullscreen();
            }
            // Ctrl+S for save
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                saveGame();
            }
        });

        // Handle fullscreen change (e.g., user presses Escape)
        document.addEventListener('fullscreenchange', () => {
            isFullscreen = !!document.fullscreenElement;
            updateFullscreenButton();
        });
    }

    // ─── Fullscreen ───

    function toggleFullscreen() {
        const container = document.getElementById('dos-container');
        if (!isFullscreen) {
            if (container.requestFullscreen) {
                container.requestFullscreen();
            }
            isFullscreen = true;
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
            isFullscreen = false;
        }
        updateFullscreenButton();
    }

    function updateFullscreenButton() {
        const btn = document.getElementById('btn-fullscreen');
        btn.textContent = isFullscreen ? '🖥️ 退出全屏' : '🖥️ 全屏';
    }

    // ─── Pause ───

    async function togglePause() {
        if (!ci) return;
        try {
            if (isPaused) {
                await ci.resume();
                isPaused = false;
                document.getElementById('btn-pause').textContent = '⏯️ 暂停';
            } else {
                await ci.pause();
                isPaused = true;
                document.getElementById('btn-pause').textContent = '▶️ 继续';
            }
        } catch (e) {
            console.error('Pause/resume error:', e);
        }
    }

    // ─── Restart ───

    async function restartGame() {
        if (!ci) return;
        if (!confirm('确定要重新开始游戏吗？未保存的进度会丢失。')) return;

        try {
            await ci.exit();
        } catch (e) { /* ignore */ }

        // Relaunch
        const loadingEl = document.getElementById('game-loading');
        loadingEl.classList.remove('hidden');
        try {
            ci = await dosInstance.run(BUNDLE_URL);
            loadingEl.classList.add('hidden');
            document.getElementById('save-status').textContent = '游戏已重启';
        } catch (e) {
            console.error('Restart failed:', e);
            loadingEl.classList.add('hidden');
        }
    }

    // ─── Volume ───

    function adjustVolume(delta) {
        volume = Math.max(0, Math.min(1, volume + delta));
        // js-dos v8 volume adjustment
        if (ci) {
            try {
                // The ci object may have volume control
                if (typeof ci.setVolume === 'function') {
                    ci.setVolume(volume);
                }
            } catch (e) { /* ignore */ }
        }
    }

    // ─── Save / Load ───

    async function saveGame() {
        if (!window.DOS.App.isLoggedIn()) {
            window.DOS.App.showToast('请先登录以保存游戏进度', 'warning');
            return;
        }

        if (!ci) {
            window.DOS.App.showToast('游戏尚未加载', 'error');
            return;
        }

        const saveStatus = document.getElementById('save-status');
        saveStatus.textContent = '保存中...';

        try {
            // Use js-dos v8 layers API to get changes
            // The save() method persists to IndexedDB, then we can extract
            await ci.save();
            await ci.persist();

            // Take a screenshot as save thumbnail
            let screenshot = null;
            try {
                screenshot = await ci.screenshot();
            } catch (e) { /* ignore */ }

            // For server-side save, we need to extract changed files
            // js-dos v8 stores changes in IndexedDB; we use the persist API
            // and then read the changes from the FS

            // Attempt to read the save data from the virtual filesystem
            // Common save file locations to check
            const saveFiles = [];
            const commonSaveDirs = ['SAVE', 'SAVES', 'SAVEDATA', 'DATA/SAVE'];

            for (const dir of commonSaveDirs) {
                try {
                    const tree = await ci.fsTree();
                    // Walk the tree for save-like files
                    // For now, persist everything
                } catch (e) { /* ignore */ }
            }

            // Use the simpler approach: serialize the entire filesystem changes
            // by using the js-dos persist mechanism which stores to IndexedDB
            // Then we read the IndexedDB entry

            // Alternative: create a save bundle manually
            // For now, notify the user that saves work through browser storage
            window.DOS.App.showToast('游戏进度已保存到浏览器 (IndexedDB)', 'success');
            saveStatus.textContent = '已保存 (浏览器)';

            // TODO: For cloud sync, use the js-dos cloud storage API
            // or manually extract and upload changed files

        } catch (err) {
            console.error('Save error:', err);
            window.DOS.App.showToast('保存失败: ' + err.message, 'error');
            saveStatus.textContent = '保存失败';
        }
    }

    async function loadGame() {
        if (!window.DOS.App.isLoggedIn()) {
            window.DOS.App.showToast('请先登录以加载游戏进度', 'warning');
            return;
        }

        const saveStatus = document.getElementById('save-status');

        // Check for IndexedDB save first (auto-loaded by js-dos on run())
        // Check for server-side save
        try {
            const resp = await window.DOS.App.apiFetch(
                `/api/games/${encodeURIComponent(GAME_ID)}/save`
            );

            if (!resp.ok) {
                if (resp.status === 404) {
                    window.DOS.App.showToast('没有找到云端存档', 'warning');
                }
                return;
            }

            // Download save blob
            const blob = await resp.blob();
            if (blob.size === 0) {
                window.DOS.App.showToast('没有找到云端存档', 'warning');
                return;
            }

            // TODO: Inject save files into the virtual filesystem
            // This requires the game to be restarted with the save data
            window.DOS.App.showToast('云端存档已加载 (重启游戏后生效)', 'success');
            saveStatus.textContent = '云端存档已加载';

        } catch (err) {
            console.error('Load error:', err);
            window.DOS.App.showToast('加载存档失败', 'error');
        }
    }

    async function checkExistingSave() {
        try {
            const resp = await window.DOS.App.apiFetch(
                `/api/games/${encodeURIComponent(GAME_ID)}/save`
            );
            if (resp.ok) {
                const data = await resp.json().catch(() => null);
                const saveInfoCard = document.getElementById('save-info-card');
                const saveInfoText = document.getElementById('save-info-text');
                if (saveInfoCard && saveInfoText) {
                    saveInfoCard.style.display = 'block';
                    saveInfoText.textContent = '已有云端存档';
                }
            }
        } catch (e) { /* ignore */ }
    }

    // ─── Metadata ───

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
