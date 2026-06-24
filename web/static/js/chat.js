/**
 * Chinese DOS Games — AI Game Companion Chat
 *
 * Features:
 * - Chat panel next to the DOS emulator (resizable)
 * - Screenshot capture from js-dos canvas → sent to AI Vision API
 * - Voice input via Web Speech API (SpeechRecognition)
 * - Voice output via SpeechSynthesis
 * - Conversation history persisted in localStorage per game
 * - Backend proxy for AI API (API key never reaches browser)
 * - User-configurable AI provider settings (bring your own key/URL/model)
 */
(function () {
    'use strict';

    const GAME_ID = window.GAME_ID;
    const STORAGE_KEY = 'chat_history_' + (GAME_ID || 'global');
    const SETTINGS_KEY = 'chat_ai_settings';
    const MAX_HISTORY = 50;
    const MAX_MESSAGE_LENGTH = 4000;

    // ═══════════════════════════════════════════════════════════
    //  State
    // ═══════════════════════════════════════════════════════════

    const state = {
        isOpen: false,
        isWaiting: false,
        isRecording: false,
        isSettingsOpen: false,
        ttsEnabled: localStorage.getItem('chat_tts_enabled') === 'true',
        autoScreenshot: localStorage.getItem('chat_auto_screenshot') === 'true',
        messages: [],        // { role, content, timestamp }
        recognition: null,
        lastScreenshot: null,
        // Server status
        serverConfigured: false,
        serverModel: '',
        // User AI settings (from localStorage)
        settings: loadSettings(),
    };

    // ═══════════════════════════════════════════════════════════
    //  DOM References (populated in init)
    // ═══════════════════════════════════════════════════════════

    let els = {};

    // ═══════════════════════════════════════════════════════════
    //  Settings Persistence
    // ═══════════════════════════════════════════════════════════

    function defaultSettings() {
        return {
            provider: 'anthropic',
            api_key: '',
            model: '',
            base_url: '',
        };
    }

    function loadSettings() {
        try {
            const raw = localStorage.getItem(SETTINGS_KEY);
            if (raw) {
                return Object.assign(defaultSettings(), JSON.parse(raw));
            }
        } catch (e) { /* ignore */ }
        return defaultSettings();
    }

    function saveSettings() {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
        } catch (e) {
            console.warn('[chat.js] Failed to save settings:', e);
        }
    }

    function hasUserConfig() {
        return !!(state.settings.api_key && state.settings.api_key.trim());
    }

    function isAIAvailable() {
        return state.serverConfigured || hasUserConfig();
    }

    // ═══════════════════════════════════════════════════════════
    //  Initialization
    // ═══════════════════════════════════════════════════════════

    async function init() {
        if (!GAME_ID) return;

        // Check server AI status
        try {
            const resp = await fetch('/api/ai/status');
            const data = await resp.json();
            state.serverConfigured = data.server_configured;
            state.serverModel = data.server_model || '';
        } catch (e) {
            state.serverConfigured = false;
        }

        // Load saved history
        loadHistory();

        // Build chat panel DOM
        buildChatDOM();

        // Set up speech recognition
        setupSpeechRecognition();

        // Set up auto-screenshot interval if enabled
        if (state.autoScreenshot) {
            startAutoScreenshot();
        }

        // Show welcome if no history
        if (state.messages.length === 0) {
            showWelcome();
        }

        // Render loaded messages
        renderAllMessages();

        // Update UI state
        updateStatusIndicator();
    }

    // ═══════════════════════════════════════════════════════════
    //  DOM Construction
    // ═══════════════════════════════════════════════════════════

    function buildChatDOM() {
        const panel = document.createElement('div');
        panel.className = 'chat-panel hidden';
        panel.id = 'chat-panel';
        panel.innerHTML = `
            <div class="chat-resize-handle" id="chat-resize-handle"></div>

            <div class="chat-header">
                <span class="chat-status-dot" id="chat-status-dot" title="检查中..."></span>
                <span class="chat-header-title">🐉 AI 游戏助手</span>
                <button class="chat-header-btn" id="btn-chat-settings" title="AI 设置">⚙️</button>
                <button class="chat-header-btn" id="btn-chat-new" title="新对话">🔄</button>
                <button class="chat-header-btn ${state.ttsEnabled ? 'active' : ''}" id="btn-chat-tts" title="语音播报">🔊</button>
                <button class="chat-header-btn" id="btn-chat-close" title="关闭面板">✕</button>
            </div>

            <!-- Settings Panel -->
            <div class="chat-settings" id="chat-settings" style="display:none;">
                <div class="chat-settings-body">
                    <div class="chat-settings-row">
                        <label class="chat-settings-label">AI 提供商</label>
                        <select class="chat-settings-select" id="settings-provider">
                            <option value="anthropic" ${state.settings.provider === 'anthropic' ? 'selected' : ''}>Anthropic (Claude)</option>
                            <option value="openai" ${state.settings.provider === 'openai' ? 'selected' : ''}>OpenAI 兼容</option>
                        </select>
                    </div>
                    <div class="chat-settings-row">
                        <label class="chat-settings-label">API 密钥</label>
                        <div class="chat-settings-key-row">
                            <input type="password" class="chat-settings-input" id="settings-key"
                                placeholder="sk-... (留空则使用服务器密钥)"
                                value="${escapeAttr(state.settings.api_key)}">
                            <button class="chat-header-btn" id="btn-toggle-key-vis" title="显示/隐藏密钥">👁️</button>
                        </div>
                    </div>
                    <div class="chat-settings-row">
                        <label class="chat-settings-label">模型名称</label>
                        <input type="text" class="chat-settings-input" id="settings-model"
                            placeholder="${state.serverModel || 'claude-sonnet-4-20250514'}"
                            value="${escapeAttr(state.settings.model)}">
                    </div>
                    <div class="chat-settings-row" id="settings-baseurl-row" ${state.settings.provider === 'openai' ? '' : 'style="display:none;"'}>
                        <label class="chat-settings-label">API 地址</label>
                        <input type="text" class="chat-settings-input" id="settings-baseurl"
                            placeholder="https://api.openai.com/v1"
                            value="${escapeAttr(state.settings.base_url)}">
                    </div>
                </div>
                <div class="chat-settings-footer">
                    <span class="chat-settings-hint" id="settings-hint"></span>
                    <div class="chat-settings-actions">
                        <button class="btn btn-sm" id="btn-settings-cancel">取消</button>
                        <button class="btn btn-sm btn-primary" id="btn-settings-save">保存</button>
                    </div>
                </div>
            </div>

            <div class="chat-messages" id="chat-messages"></div>

            <div class="chat-input-area" id="chat-input-area">
                <div class="chat-input-row">
                    <textarea
                        class="chat-input"
                        id="chat-input"
                        placeholder="输入消息，或点击 🎤 语音输入..."
                        rows="1"
                        maxlength="${MAX_MESSAGE_LENGTH}"
                    ></textarea>
                    <button class="chat-btn" id="btn-chat-mic" title="语音输入">🎤</button>
                    <button class="chat-btn" id="btn-chat-screenshot" title="截屏附加">📸</button>
                    <button class="chat-btn primary" id="btn-chat-send" title="发送">➤</button>
                </div>
                <div class="chat-toolbar">
                    <label class="chat-toolbar-toggle ${state.autoScreenshot ? 'active' : ''}" id="toggle-auto-ss" title="自动附加截屏 (每30秒)">
                        <span class="chat-toolbar-indicator"></span>
                        自动截屏
                    </label>
                    <span class="chat-toolbar-config-hint" id="config-hint"></span>
                </div>
            </div>
        `;

        // Insert panel at body level (fixed position overlay)
        document.body.appendChild(panel);

        // Create backdrop for mobile
        const backdrop = document.createElement('div');
        backdrop.className = 'chat-backdrop';
        backdrop.id = 'chat-backdrop';
        backdrop.addEventListener('click', () => {
            if (state.isOpen) togglePanel();
        });
        document.body.appendChild(backdrop);

        // Cache DOM refs
        els.panel = panel;
        els.messagesContainer = document.getElementById('chat-messages');
        els.input = document.getElementById('chat-input');
        els.sendBtn = document.getElementById('btn-chat-send');
        els.micBtn = document.getElementById('btn-chat-mic');
        els.ssBtn = document.getElementById('btn-chat-screenshot');
        els.statusDot = document.getElementById('chat-status-dot');
        els.inputArea = document.getElementById('chat-input-area');
        els.resizeHandle = document.getElementById('chat-resize-handle');
        els.settingsPanel = document.getElementById('chat-settings');
        els.configHint = document.getElementById('config-hint');
        els.backdrop = document.getElementById('chat-backdrop');

        // Attach events
        attachEvents();
        updateConfigHint();
    }

    function attachEvents() {
        // Toggle button in game controls
        const toggleBtn = document.getElementById('btn-chat-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', togglePanel);
        }

        // Close button
        document.getElementById('btn-chat-close').addEventListener('click', () => {
            if (state.isOpen) togglePanel();
        });

        // Settings gear button
        document.getElementById('btn-chat-settings').addEventListener('click', toggleSettings);

        // Settings save/cancel
        document.getElementById('btn-settings-save').addEventListener('click', saveSettingsFromUI);
        document.getElementById('btn-settings-cancel').addEventListener('click', () => {
            toggleSettings(false);
        });

        // Key visibility toggle
        document.getElementById('btn-toggle-key-vis').addEventListener('click', toggleKeyVisibility);

        // Provider change
        document.getElementById('settings-provider').addEventListener('change', onProviderChange);

        // New conversation
        document.getElementById('btn-chat-new').addEventListener('click', clearHistory);

        // TTS toggle
        document.getElementById('btn-chat-tts').addEventListener('click', toggleTTS);

        // Send button
        els.sendBtn.addEventListener('click', () => {
            const text = els.input.value.trim();
            if (text) sendMessage(text);
        });

        // Enter to send, Shift+Enter for newline
        els.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const text = els.input.value.trim();
                if (text) sendMessage(text);
            }
        });

        // Auto-resize textarea
        els.input.addEventListener('input', autoResizeInput);

        // Mic button
        els.micBtn.addEventListener('click', () => {
            if (state.isRecording) { stopRecording(); }
            else { startRecording(); }
        });

        // Screenshot button
        els.ssBtn.addEventListener('click', captureAndAttach);

        // Auto-screenshot toggle
        document.getElementById('toggle-auto-ss').addEventListener('click', toggleAutoScreenshot);

        // Resize handle
        setupResize();

        // Keyboard: Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && state.isOpen) {
                if (state.isSettingsOpen) {
                    toggleSettings(false);
                } else if (els.panel.contains(document.activeElement)) {
                    togglePanel();
                }
            }
        });
    }

    // ═══════════════════════════════════════════════════════════
    //  Settings Panel
    // ═══════════════════════════════════════════════════════════

    function toggleSettings(forceState) {
        state.isSettingsOpen = (typeof forceState === 'boolean')
            ? forceState
            : !state.isSettingsOpen;

        els.settingsPanel.style.display = state.isSettingsOpen ? 'block' : 'none';

        const btn = document.getElementById('btn-chat-settings');
        if (btn) {
            btn.classList.toggle('active', state.isSettingsOpen);
        }

        // Populate fields from current settings when opening
        if (state.isSettingsOpen) {
            populateSettingsUI();
            updateSettingsHint();
        }
    }

    function populateSettingsUI() {
        document.getElementById('settings-provider').value = state.settings.provider;
        document.getElementById('settings-key').value = state.settings.api_key;
        document.getElementById('settings-model').value = state.settings.model;
        document.getElementById('settings-baseurl').value = state.settings.base_url;

        // Show/hide base URL based on provider
        const baseUrlRow = document.getElementById('settings-baseurl-row');
        if (baseUrlRow) {
            baseUrlRow.style.display = state.settings.provider === 'openai' ? '' : 'none';
        }

        // Update model placeholder based on provider
        const modelInput = document.getElementById('settings-model');
        if (state.settings.provider === 'openai') {
            modelInput.placeholder = 'gpt-4o';
        } else {
            modelInput.placeholder = state.serverModel || 'claude-sonnet-4-20250514';
        }
    }

    function saveSettingsFromUI() {
        state.settings.provider = document.getElementById('settings-provider').value;
        state.settings.api_key = document.getElementById('settings-key').value.trim();
        state.settings.model = document.getElementById('settings-model').value.trim();
        state.settings.base_url = document.getElementById('settings-baseurl').value.trim();

        saveSettings();
        updateStatusIndicator();
        updateConfigHint();
        toggleSettings(false);

        window.DOS.App.showToast('✅ AI 设置已保存', 'success');
    }

    function onProviderChange() {
        const prov = document.getElementById('settings-provider').value;
        const baseUrlRow = document.getElementById('settings-baseurl-row');
        const modelInput = document.getElementById('settings-model');

        if (baseUrlRow) {
            baseUrlRow.style.display = prov === 'openai' ? '' : 'none';
        }
        if (modelInput) {
            modelInput.placeholder = prov === 'openai' ? 'gpt-4o' : (state.serverModel || 'claude-sonnet-4-20250514');
        }
        updateSettingsHint();
    }

    function toggleKeyVisibility() {
        const keyInput = document.getElementById('settings-key');
        const btn = document.getElementById('btn-toggle-key-vis');
        if (keyInput.type === 'password') {
            keyInput.type = 'text';
            btn.textContent = '🙈';
        } else {
            keyInput.type = 'password';
            btn.textContent = '👁️';
        }
    }

    function updateSettingsHint() {
        const hint = document.getElementById('settings-hint');
        if (!hint) return;
        const prov = document.getElementById('settings-provider').value;
        if (prov === 'openai') {
            hint.textContent = '兼容 OpenAI Chat Completions API 的任何提供商（如 OpenAI、Ollama、vLLM、LM Studio 等）';
        } else {
            hint.textContent = '可直接使用 Anthropic API，或任何兼容 Anthropic Messages API 的代理';
        }
    }

    function updateStatusIndicator() {
        if (!els.statusDot) return;
        els.statusDot.className = 'chat-status-dot';
        if (isAIAvailable()) {
            els.statusDot.classList.add('connected');
            els.statusDot.title = hasUserConfig()
                ? '使用自定义 API 密钥'
                : '使用服务器 AI 配置';
        } else {
            els.statusDot.classList.add('disabled');
            els.statusDot.title = 'AI 未配置 — 点击 ⚙️ 设置 API 密钥';
        }
    }

    function updateConfigHint() {
        if (!els.configHint) return;
        if (hasUserConfig()) {
            els.configHint.textContent = state.settings.provider === 'openai'
                ? '🔑 自定义 OpenAI 密钥'
                : '🔑 自定义 Anthropic 密钥';
            els.configHint.style.color = 'var(--success)';
        } else if (state.serverConfigured) {
            els.configHint.textContent = '🖥️ 使用服务器密钥';
            els.configHint.style.color = 'var(--text-dim)';
        } else {
            els.configHint.textContent = '⚠️ 未配置 — 点击 ⚙️ 设置';
            els.configHint.style.color = 'var(--warning)';
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  Panel Visibility
    // ═══════════════════════════════════════════════════════════

    function togglePanel() {
        state.isOpen = !state.isOpen;

        if (state.isOpen) {
            els.panel.classList.remove('hidden');
            if (els.backdrop) els.backdrop.classList.add('visible');
            setTimeout(() => {
                els.input.focus();
                scrollToBottom();
            }, 300); // Wait for slide animation
        } else {
            els.panel.classList.add('hidden');
            if (els.backdrop) els.backdrop.classList.remove('visible');
            // Close settings too
            if (state.isSettingsOpen) toggleSettings(false);
        }

        updateToggleButton();
    }

    function updateToggleButton() {
        const btn = document.getElementById('btn-chat-toggle');
        if (btn) {
            btn.textContent = state.isOpen ? '🤖 隐藏助手' : '🤖 助手';
            if (state.isOpen) {
                btn.classList.add('save-btn');
            } else {
                btn.classList.remove('save-btn');
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  Resize
    // ═══════════════════════════════════════════════════════════

    function setupResize() {
        const handle = els.resizeHandle;
        if (!handle) return;

        let startX = 0;
        let startWidth = 0;

        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            startX = e.clientX;
            startWidth = els.panel.offsetWidth;
            handle.classList.add('active');

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        function onMouseMove(e) {
            const delta = e.clientX - startX;
            let newWidth = startWidth + delta;
            newWidth = Math.max(280, Math.min(480, newWidth));
            els.panel.style.width = newWidth + 'px';
        }

        function onMouseUp() {
            handle.classList.remove('active');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            localStorage.setItem('chat_panel_width', els.panel.style.width);
        }

        const savedWidth = localStorage.getItem('chat_panel_width');
        if (savedWidth) {
            els.panel.style.width = savedWidth;
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  Screenshot Capture
    // ═══════════════════════════════════════════════════════════

    /**
     * Capture a screenshot of the current game screen.
     *
     * Primary: Uses js-dos native ci.screenshot() via window.DOS.Game.captureScreenshot()
     *   which properly reads the WebGL drawing buffer (canvas.toDataURL() returns
     *   black for WebGL canvases with preserveDrawingBuffer=false).
     * Fallback: Direct canvas read, scanning all canvases in dos-container.
     *
     * @returns {Promise<string|null>} Base64-encoded JPEG data, or null on failure
     */
    async function captureScreenshot() {
        // ── Method 1: js-dos native API (handles WebGL properly) ──
        if (window.DOS && window.DOS.Game && window.DOS.Game.captureScreenshot) {
            try {
                const result = await window.DOS.Game.captureScreenshot();
                if (result) {
                    return result;
                }
                console.warn('[chat.js] DOS.Game.captureScreenshot returned null, trying fallback...');
            } catch (e) {
                console.warn('[chat.js] DOS.Game.captureScreenshot failed:', e.message, ', trying fallback...');
            }
        }

        // ── Method 2: Direct canvas read (scan all canvases) ──
        const container = document.getElementById('dos-container');
        if (container) {
            const canvases = container.querySelectorAll('canvas');
            for (const canvas of canvases) {
                try {
                    if (canvas.width < 16 || canvas.height < 16) continue;
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
                    const base64 = dataUrl.split(',')[1];
                    if (base64 && base64.length > 500) {
                        console.log('[chat.js] Screenshot OK via canvas fallback, size:', base64.length,
                                    'canvas:', canvas.width + 'x' + canvas.height,
                                    'context:', canvas.getContext('webgl') ? 'webgl' : (canvas.getContext('2d') ? '2d' : 'unknown'));
                        return base64;
                    }
                } catch (e) {
                    // Tainted canvas or other error — skip this canvas
                    continue;
                }
            }
        }

        // ── Method 3: Single canvas querySelector fallback (original behavior) ──
        const canvas = document.querySelector('#dos-container canvas');
        if (canvas && canvas.width >= 16 && canvas.height >= 16) {
            try {
                const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
                const base64 = dataUrl.split(',')[1];
                if (base64 && base64.length > 500) {
                    console.log('[chat.js] Screenshot OK via single-canvas fallback, size:', base64.length);
                    return base64;
                }
            } catch (e) {
                console.warn('[chat.js] Single-canvas fallback failed:', e.message);
            }
        }

        console.warn('[chat.js] All screenshot methods failed');
        return null;
    }

    async function captureAndAttach() {
        const ss = await captureScreenshot();
        if (ss) {
            state.lastScreenshot = ss;
            els.ssBtn.classList.add('screenshot-attached');
            els.ssBtn.title = '截屏已附加 ✓';
            window.DOS.App.showToast('📸 截屏已附加到下次消息', 'info');
            setTimeout(() => {
                els.ssBtn.classList.remove('screenshot-attached');
                els.ssBtn.title = '截屏附加';
            }, 3000);
        } else {
            window.DOS.App.showToast('无法截屏：游戏画面不可用', 'warning');
        }
    }

    let _autoSsInterval = null;

    function startAutoScreenshot() {
        if (_autoSsInterval) return;
        _autoSsInterval = setInterval(() => {
            if (state.isOpen && !state.isWaiting) {
                (async () => {
                    const ss = await captureScreenshot();
                    if (ss) state.lastScreenshot = ss;
                })();
            }
        }, 30000);
    }

    function stopAutoScreenshot() {
        if (_autoSsInterval) {
            clearInterval(_autoSsInterval);
            _autoSsInterval = null;
        }
    }

    function toggleAutoScreenshot() {
        state.autoScreenshot = !state.autoScreenshot;
        localStorage.setItem('chat_auto_screenshot', state.autoScreenshot);
        const toggle = document.getElementById('toggle-auto-ss');
        if (toggle) toggle.classList.toggle('active', state.autoScreenshot);
        if (state.autoScreenshot) {
            startAutoScreenshot();
            window.DOS.App.showToast('✅ 自动截屏已开启 (每30秒)', 'info');
        } else {
            stopAutoScreenshot();
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  Message Sending
    // ═══════════════════════════════════════════════════════════

    async function sendMessage(text) {
        if (!text || state.isWaiting) return;
        if (!isAIAvailable()) {
            window.DOS.App.showToast('请先在 ⚙️ 设置中配置 API 密钥', 'warning');
            toggleSettings(true);
            return;
        }

        const trimmed = text.trim().substring(0, MAX_MESSAGE_LENGTH);
        if (!trimmed) return;

        const screenshot = state.lastScreenshot || await captureScreenshot();
        state.lastScreenshot = null;
        els.ssBtn.classList.remove('screenshot-attached');

        const userMsg = { role: 'user', content: trimmed, timestamp: Date.now() };
        if (screenshot) userMsg._hasScreenshot = true;
        state.messages.push(userMsg);
        addMessageBubble('user', trimmed, !!screenshot);
        saveHistory();

        els.input.value = '';
        autoResizeInput();

        state.isWaiting = true;
        setInputEnabled(false);
        showTyping();

        try {
            const result = await callAI(state.messages, screenshot);
            if (result.reply) {
                const aiMsg = { role: 'assistant', content: result.reply, timestamp: Date.now() };
                state.messages.push(aiMsg);
                addMessageBubble('assistant', result.reply);
                saveHistory();
                if (state.ttsEnabled) speakText(result.reply);
            } else if (result.error) {
                addSystemMessage(result.error, true);
            }
        } catch (err) {
            console.error('[chat.js] API call failed:', err);
            addSystemMessage('网络连接失败，请检查网络后重试', true);
        } finally {
            hideTyping();
            state.isWaiting = false;
            setInputEnabled(true);
            els.input.focus();
        }
    }

    async function callAI(messages, screenshot) {
        const apiMessages = messages.map(m => ({
            role: m.role,
            content: m.content,
        }));
        const trimmed = apiMessages.slice(-MAX_HISTORY);

        // Build request body with user settings
        const body = {
            messages: trimmed,
            screenshot: screenshot || null,
        };

        // Include user AI config overrides if user has configured their own key
        if (hasUserConfig()) {
            body.api_key = state.settings.api_key;
            body.provider = state.settings.provider;
            if (state.settings.model) body.model = state.settings.model;
            if (state.settings.base_url) body.base_url = state.settings.base_url;
        }

        const resp = await fetch('/api/ai/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.error || 'HTTP ' + resp.status);
        }

        return await resp.json();
    }

    // ═══════════════════════════════════════════════════════════
    //  Message Rendering
    // ═══════════════════════════════════════════════════════════

    function addMessageBubble(role, content, hasScreenshot) {
        hideWelcome();
        const div = document.createElement('div');
        div.className = 'chat-message chat-message--' + role;

        if (role === 'user') {
            if (hasScreenshot) {
                div.innerHTML = '<span class="chat-screenshot-badge">📸 截屏</span><br>' + escapeHtml(content);
            } else {
                div.textContent = content;
            }
        } else if (role === 'assistant') {
            div.innerHTML = formatAssistantMessage(content);
        }

        els.messagesContainer.appendChild(div);
        scrollToBottom();
    }

    function addSystemMessage(text, isError) {
        hideWelcome();
        const div = document.createElement('div');
        div.className = 'chat-message chat-message--system' + (isError ? ' error' : '');
        div.textContent = text;

        if (isError && state.messages.length > 0) {
            const lastUserMsg = [...state.messages].reverse().find(m => m.role === 'user');
            if (lastUserMsg) {
                div.appendChild(document.createElement('br'));
                const retryBtn = document.createElement('button');
                retryBtn.className = 'retry-btn';
                retryBtn.textContent = '🔄 重试';
                retryBtn.addEventListener('click', () => {
                    div.remove();
                    sendMessage(lastUserMsg.content);
                });
                div.appendChild(retryBtn);
            }
        }

        els.messagesContainer.appendChild(div);
        scrollToBottom();
    }

    function renderAllMessages() {
        els.messagesContainer.innerHTML = '';
        if (state.messages.length === 0) {
            showWelcome();
            return;
        }
        state.messages.forEach(m => {
            addMessageBubble(m.role, m.content, m._hasScreenshot);
        });
        scrollToBottom();
    }

    function showTyping() {
        hideWelcome();
        if (document.getElementById('chat-typing')) return;
        const div = document.createElement('div');
        div.className = 'chat-typing';
        div.id = 'chat-typing';
        div.innerHTML = `
            <div class="chat-typing-dot"></div>
            <div class="chat-typing-dot"></div>
            <div class="chat-typing-dot"></div>
        `;
        els.messagesContainer.appendChild(div);
        scrollToBottom();
    }

    function hideTyping() {
        const el = document.getElementById('chat-typing');
        if (el) el.remove();
    }

    function showWelcome() {
        const container = els.messagesContainer;
        if (!container) return;
        if (state.messages.length > 0) return;
        if (container.querySelector('.chat-welcome')) return;

        container.innerHTML = `
            <div class="chat-welcome">
                <div class="chat-welcome-icon">🐉</div>
                <div class="chat-welcome-title">你好！我是小龙</div>
                <div class="chat-welcome-text">
                    我是你的 AI 游戏助手。<br>
                    我可以看到你的游戏画面，帮你记住任务、解谜、提供攻略建议，或者只是陪你聊天。
                </div>
                ${!isAIAvailable() ? `
                <div class="chat-welcome-config-note">
                    ⚠️ 尚未配置 AI 服务<br>
                    <small>点击上方 ⚙️ 按钮设置你的 API 密钥，或让管理员配置服务器密钥</small>
                </div>` : ''}
                <div class="chat-welcome-hints">
                    <button class="chat-hint-btn" data-hint="这个游戏怎么玩？">💡 这个游戏怎么玩？</button>
                    <button class="chat-hint-btn" data-hint="帮我看看现在应该做什么">👀 帮我看看现在应该做什么</button>
                    <button class="chat-hint-btn" data-hint="给我讲个关于这个游戏的趣事">📖 给我讲个关于这个游戏的趣事</button>
                </div>
            </div>
        `;

        container.querySelectorAll('.chat-hint-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const hint = btn.dataset.hint;
                if (hint) {
                    if (!isAIAvailable()) {
                        window.DOS.App.showToast('请先在 ⚙️ 设置中配置 API 密钥', 'warning');
                        toggleSettings(true);
                        return;
                    }
                    sendMessage(hint);
                }
            });
        });
    }

    function hideWelcome() {
        const welcome = els.messagesContainer?.querySelector('.chat-welcome');
        if (welcome) welcome.remove();
    }

    function formatAssistantMessage(text) {
        let html = escapeHtml(text);
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        html = html.replace(/\n/g, '<br>');
        return html;
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function escapeAttr(str) {
        return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
                  .replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function scrollToBottom() {
        if (els.messagesContainer) {
            setTimeout(() => {
                els.messagesContainer.scrollTop = els.messagesContainer.scrollHeight;
            }, 50);
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  Input Management
    // ═══════════════════════════════════════════════════════════

    function setInputEnabled(enabled) {
        els.input.disabled = !enabled;
        els.sendBtn.disabled = !enabled;
        els.micBtn.disabled = !enabled;

        if (enabled) {
            els.input.placeholder = '输入消息，或点击 🎤 语音输入...';
            els.sendBtn.classList.add('primary');
        } else {
            els.input.placeholder = 'AI 正在思考...';
            els.sendBtn.classList.remove('primary');
        }
    }

    function autoResizeInput() {
        els.input.style.height = 'auto';
        els.input.style.height = Math.min(els.input.scrollHeight, 100) + 'px';
    }

    // ═══════════════════════════════════════════════════════════
    //  Voice Input (SpeechRecognition)
    // ═══════════════════════════════════════════════════════════

    function setupSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            els.micBtn.style.display = 'none';
            els.micBtn.title = '浏览器不支持语音识别';
            return;
        }

        // Check if we're on a secure context (required for microphone)
        if (!window.isSecureContext) {
            els.micBtn.title = '语音需要 HTTPS 或 localhost';
            els.micBtn.style.opacity = '0.5';
            // Still allow clicking to show the explanation
            return;
        }

        state.recognition = new SpeechRecognition();
        state.recognition.lang = 'zh-CN';
        state.recognition.continuous = false;
        state.recognition.interimResults = false;
        state.recognition.maxAlternatives = 1;

        state.recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            if (transcript && transcript.trim()) {
                els.input.value = transcript;
                sendMessage(transcript);
            }
        };

        state.recognition.onerror = (event) => {
            console.warn('[chat.js] Speech recognition error:', event.error);
            handleSpeechError(event.error);
            stopRecording();
        };

        state.recognition.onend = () => { stopRecording(); };
    }

    function handleSpeechError(error) {
        switch (error) {
            case 'not-allowed':
                showMicPermissionHelp();
                break;
            case 'no-speech':
                window.DOS.App.showToast('未检测到语音，请重试', 'warning');
                break;
            case 'audio-capture':
                window.DOS.App.showToast('未找到麦克风设备', 'error');
                break;
            case 'network':
                window.DOS.App.showToast('语音识别需要网络连接', 'error');
                break;
            default:
                window.DOS.App.showToast('语音识别失败: ' + error, 'error');
        }
    }

    // Show inline permission help below the mic button
    let _micHelpEl = null;

    function showMicPermissionHelp() {
        // Remove any existing help
        hideMicPermissionHelp();

        _micHelpEl = document.createElement('div');
        _micHelpEl.className = 'chat-mic-help';
        _micHelpEl.innerHTML = `
            <div class="chat-mic-help-title">🎤 麦克风权限未授予</div>
            <div class="chat-mic-help-steps">
                <p>语音输入需要浏览器授予麦克风权限：</p>
                <ol>
                    <li>点击地址栏左侧的 🔒/ⓘ 图标</li>
                    <li>找到"麦克风"选项，设为<b>允许</b></li>
                    <li>刷新页面后重试</li>
                </ol>
                ${!window.isSecureContext ? '<p class="chat-mic-help-warn">⚠️ 当前页面非 HTTPS 连接，语音功能仅在 localhost 或 HTTPS 下可用</p>' : ''}
            </div>
            <button class="btn btn-sm" id="btn-mic-retry">🔄 已授权，重试</button>
            <button class="btn btn-sm" id="btn-mic-dismiss">关闭</button>
        `;
        _micHelpEl.style.display = 'block';
        els.inputArea.appendChild(_micHelpEl);

        // Scroll to show the help
        els.messagesContainer.scrollTop = els.messagesContainer.scrollHeight;

        document.getElementById('btn-mic-retry').addEventListener('click', () => {
            hideMicPermissionHelp();
            startRecording();
        });
        document.getElementById('btn-mic-dismiss').addEventListener('click', hideMicPermissionHelp);
    }

    function hideMicPermissionHelp() {
        if (_micHelpEl) {
            _micHelpEl.remove();
            _micHelpEl = null;
        }
    }

    async function startRecording() {
        if (!state.recognition || state.isRecording || state.isWaiting) return;

        // Check secure context
        if (!window.isSecureContext) {
            showMicPermissionHelp();
            return;
        }

        hideMicPermissionHelp();

        try {
            state.isRecording = true;
            state.recognition.start();
            els.micBtn.classList.add('recording');
            els.micBtn.title = '录音中...点击停止';
            els.input.placeholder = '🎤 正在聆听...';
        } catch (e) {
            console.warn('[chat.js] Failed to start recording:', e);
            stopRecording();
            showMicPermissionHelp();
        }
    }

    function stopRecording() {
        state.isRecording = false;
        els.micBtn.classList.remove('recording');
        els.micBtn.title = '语音输入';
        els.input.placeholder = '输入消息，或点击 🎤 语音输入...';
        try { if (state.recognition) state.recognition.stop(); } catch (e) { /* */ }
    }

    // ═══════════════════════════════════════════════════════════
    //  Text-to-Speech
    // ═══════════════════════════════════════════════════════════

    // Pre-load voices — they load asynchronously in most browsers
    let _voicesLoaded = false;
    let _cachedZhVoice = null;

    function preloadVoices() {
        if (!window.speechSynthesis) return;
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
            _voicesLoaded = true;
            _cachedZhVoice = voices.find(
                v => v.lang.startsWith('zh-CN') || v.lang.startsWith('zh-TW')
            ) || null;
        }
    }

    // Listen for async voice loading
    if (window.speechSynthesis) {
        preloadVoices();
        window.speechSynthesis.addEventListener('voiceschanged', preloadVoices);
    }

    function speakText(text) {
        if (!window.speechSynthesis) return;

        // Cancel any ongoing speech
        window.speechSynthesis.cancel();

        // Try loading voices if not yet done
        if (!_voicesLoaded) preloadVoices();

        // Strip markdown
        const cleanText = text
            .replace(/\*\*(.+?)\*\*/g, '$1')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/\n{2,}/g, '。')
            .replace(/\n/g, '。')
            .replace(/[#*\-–—>]/g, '');

        // Split long text into sentences for more reliable playback
        const sentences = cleanText.split(/[。！？\.!\?]/).filter(s => s.trim());
        if (sentences.length === 0) {
            sentences.push(cleanText);
        }

        // Speak each sentence
        let delay = 0;
        sentences.forEach((sentence) => {
            const trimmed = sentence.trim();
            if (!trimmed) return;

            setTimeout(() => {
                const utterance = new SpeechSynthesisUtterance(trimmed);
                utterance.lang = 'zh-CN';
                utterance.rate = 0.9;
                utterance.pitch = 1.0;
                utterance.volume = 1.0;

                if (_cachedZhVoice) {
                    utterance.voice = _cachedZhVoice;
                }

                window.speechSynthesis.speak(utterance);
            }, delay);

            // Estimate delay based on text length (rough: ~4 chars/sec for Chinese)
            delay += Math.max(1500, trimmed.length * 250);
        });

        // Update button state while speaking
        updateTTSSpeakingState(true, delay);
    }

    function updateTTSSpeakingState(speaking, totalDelay) {
        const btn = document.getElementById('btn-chat-tts');
        if (!btn) return;

        if (speaking && state.ttsEnabled) {
            btn.classList.add('tts-speaking');
            btn.title = '正在播报...';
            // Clear speaking state after estimated total time
            setTimeout(() => {
                btn.classList.remove('tts-speaking');
                btn.title = state.ttsEnabled ? '语音播报: 开' : '语音播报: 关';
            }, totalDelay + 500);
        }
    }

    function toggleTTS() {
        state.ttsEnabled = !state.ttsEnabled;
        localStorage.setItem('chat_tts_enabled', state.ttsEnabled);

        if (!state.ttsEnabled) {
            // Stop any ongoing speech when toggling off
            window.speechSynthesis.cancel();
            const btn = document.getElementById('btn-chat-tts');
            if (btn) btn.classList.remove('tts-speaking');
        }

        const btn = document.getElementById('btn-chat-tts');
        if (btn) {
            btn.classList.toggle('active', state.ttsEnabled);
            btn.title = state.ttsEnabled ? '语音播报: 开' : '语音播报: 关';
        }

        // Test-speak a short phrase so user knows it's working
        if (state.ttsEnabled) {
            window.DOS.App.showToast('🔊 语音播报已开启', 'success');
            // Quick test
            const testUtterance = new SpeechSynthesisUtterance('语音播报已开启');
            testUtterance.lang = 'zh-CN';
            testUtterance.rate = 1.0;
            testUtterance.volume = 0.8;
            if (_cachedZhVoice) testUtterance.voice = _cachedZhVoice;
            window.speechSynthesis.speak(testUtterance);
        } else {
            window.DOS.App.showToast('🔇 语音播报已关闭', 'info');
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  Conversation Persistence
    // ═══════════════════════════════════════════════════════════

    function saveHistory() {
        try {
            const compact = state.messages.slice(-MAX_HISTORY).map(m => ({
                role: m.role,
                content: m.content,
                timestamp: m.timestamp,
            }));
            localStorage.setItem(STORAGE_KEY, JSON.stringify(compact));
        } catch (e) {
            console.warn('[chat.js] Failed to save history:', e);
        }
    }

    function loadHistory() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    state.messages = parsed.slice(-MAX_HISTORY);
                }
            }
        } catch (e) {
            console.warn('[chat.js] Failed to load history:', e);
            state.messages = [];
        }
    }

    function clearHistory() {
        if (!confirm('确定要开始新对话吗？当前对话历史将被清除。')) return;
        state.messages = [];
        state.lastScreenshot = null;
        localStorage.removeItem(STORAGE_KEY);
        els.messagesContainer.innerHTML = '';
        showWelcome();
        window.DOS.App.showToast('新对话已开始 ✨', 'success');
    }

    // ═══════════════════════════════════════════════════════════
    //  Cleanup
    // ═══════════════════════════════════════════════════════════

    window.addEventListener('beforeunload', () => {
        saveHistory();
        stopAutoScreenshot();
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
    });

    // ═══════════════════════════════════════════════════════════
    //  Start
    // ═══════════════════════════════════════════════════════════

    document.addEventListener('DOMContentLoaded', init);
})();
