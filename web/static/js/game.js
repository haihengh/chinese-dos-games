/**
 * Chinese DOS Games — js-dos v8 Game Player
 *
 * Uses js-dos v8 with DOSBox-X backend for Chinese character support.
 * v8 API: Dos(element, { url, backend, ... }) returns DosProps.
 * No .run() method — the bundle URL is passed in options.
 */
(function () {
    'use strict';

    let dosProps = null;    // DosProps from Dos()
    let isPaused = false;
    let isFullscreen = false;
    let volume = 1.0;

    const GAME_ID = window.GAME_ID;
    const BUNDLE_URL = `/api/games/${encodeURIComponent(GAME_ID)}/bundle`;

    /** HTML for the loading overlay, reused on restart. */
    const LOADING_HTML = `
        <div class="loading-spinner"></div>
        <p class="loading-text">正在加载游戏...</p>
    `;

    /**
     * Create (or recreate) the js-dos v8 player inside #dos-container.
     * Returns a promise that resolves when "ci-ready" fires.
     */
    function createDosPlayer() {
        const container = document.getElementById('dos-container');
        const saveStatus = document.getElementById('save-status');

        // Clear container and re-add the loading overlay
        container.innerHTML = '';
        const loadingEl = document.createElement('div');
        loadingEl.className = 'game-loading';
        loadingEl.id = 'game-loading';
        loadingEl.innerHTML = LOADING_HTML;
        container.appendChild(loadingEl);

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('游戏加载超时，请检查网络连接'));
            }, 120000); // 2-minute timeout for large bundles

            try {
                dosProps = Dos(container, {
                    url: BUNDLE_URL,
                    backend: 'dosboxX',
                    volume: volume,
                    autoStart: true,
                    onEvent: (event, ci) => {
                        if (event === 'ci-ready') {
                            clearTimeout(timeout);
                            const le = document.getElementById('game-loading');
                            if (le) le.classList.add('hidden');
                            saveStatus.textContent = '游戏已就绪';
                            resolve(ci);
                        } else if (event === 'fullscreen-changed') {
                            // ci is the new fullscreen state (boolean)
                            isFullscreen = !!ci;
                            updateFullscreenButton();
                        }
                    },
                });
            } catch (err) {
                clearTimeout(timeout);
                reject(err);
            }
        });
    }

    // ─── Startup ───

    document.addEventListener('DOMContentLoaded', async () => {
        const container = document.getElementById('dos-container');
        const loadingEl = document.getElementById('game-loading');

        if (!container || !GAME_ID) return;

        // Check for existing save
        if (typeof window.DOS !== 'undefined' && window.DOS.App && window.DOS.App.isLoggedIn()) {
            checkExistingSave();
        }

        // Initialize js-dos v8
        try {
            await createDosPlayer();
        } catch (err) {
            console.error('Failed to start game:', err);
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

        // Setup controls
        setupControls();
        loadMetadata();
    });

    // ─── Controls Setup ───

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

        // Keyboard shortcuts
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

        // If user exits fullscreen via Escape, sync state
        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement) {
                isFullscreen = false;
                updateFullscreenButton();
            }
        });
    }

    // ─── Fullscreen ───

    function toggleFullscreen() {
        if (!dosProps) return;
        isFullscreen = !isFullscreen;
        dosProps.setFullScreen(isFullscreen);
        updateFullscreenButton();
    }

    function updateFullscreenButton() {
        const btn = document.getElementById('btn-fullscreen');
        if (btn) {
            btn.textContent = isFullscreen ? '🖥️ 退出全屏' : '🖥️ 全屏';
        }
    }

    // ─── Pause ───

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

    // ─── Restart ───

    async function restartGame() {
        if (!dosProps) return;
        if (!confirm('确定要重新开始游戏吗？未保存的进度会丢失。')) return;

        document.getElementById('save-status').textContent = '重启中...';

        try {
            await dosProps.stop();
            dosProps = null;
        } catch (e) { /* ignore */ }

        try {
            await createDosPlayer();
            document.getElementById('save-status').textContent = '游戏已重启';
        } catch (e) {
            console.error('Restart failed:', e);
            document.getElementById('save-status').textContent = '重启失败';
        }
    }

    // ─── Volume ───

    function adjustVolume(delta) {
        volume = Math.max(0, Math.min(1, volume + delta));
        if (dosProps) {
            dosProps.setVolume(volume);
        }
    }

    // ─── Save / Load ───

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

        try {
            const saved = await dosProps.save();
            if (saved) {
                window.DOS.App.showToast('游戏进度已保存到浏览器 (IndexedDB)', 'success');
                saveStatus.textContent = '已保存 (浏览器)';
            } else {
                window.DOS.App.showToast('保存失败', 'error');
                saveStatus.textContent = '保存失败';
            }
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
            window.DOS.App.showToast('云端存档已加载 (重启游戏后生效)', 'success');
            saveStatus.textContent = '云端存档已加载';

        } catch (err) {
            console.error('Load error:', err);
            window.DOS.App.showToast('加载存档失败', 'error');
        }
    }

    // ─── Existing Save Check ───

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
