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
    //  Settings Persistence (must precede state which calls loadSettings)
    // ═══════════════════════════════════════════════════════════

    // Edge TTS voice presets
    const TTS_VOICES = {
        'mandarin-female': { voice: 'zh-CN-XiaoxiaoNeural', label: '普通话 女声 (晓晓)' },
        'mandarin-male':   { voice: 'zh-CN-YunxiNeural',   label: '普通话 男声 (云希)' },
        'cantonese-female':{ voice: 'zh-HK-HiuGaaiNeural', label: '广东话 女声 (晓佳)' },
        'cantonese-male':  { voice: 'zh-HK-WanLungNeural', label: '广东话 男声 (云龙)' },
    };
    const TTS_DEFAULT_VOICE = 'mandarin-female';

    function defaultSettings() {
        return {
            provider: 'anthropic',
            api_key: '',
            model: '',
            base_url: '',
            personality: 'wawa',
            tts_voice: TTS_DEFAULT_VOICE,
            tts_rate: '+15%',
        };
    }

    // ═══════════════════════════════════════════════════════════
    //  State
    // ═══════════════════════════════════════════════════════════

    const state = {
        isOpen: false,
        isPinned: localStorage.getItem('chat_pinned') === 'true',
        defaultOpen: localStorage.getItem('chat_default_open') !== 'false',  // true unless user explicitly closed
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
        localAI: false,
        localAIDefault: false,
        localAIModel: null,
        // User AI settings (from localStorage)
        settings: loadSettings(),
        // Personality presets from server
        personalities: null,
    };

    // ═══════════════════════════════════════════════════════════
    //  DOM References (populated in init)
    // ═══════════════════════════════════════════════════════════

    let els = {};

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
        return state.serverConfigured || hasUserConfig() || state.localAIDefault;
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
            state.localAI = data.local_ai_available || false;
            state.localAIDefault = data.local_ai_default || false;
            state.localAIModel = data.local_ai_model || null;
        } catch (e) {
            state.serverConfigured = false;
        }

        // Fetch personality presets
        try {
            const resp = await fetch('/api/ai/personalities');
            state.personalities = await resp.json();
        } catch (e) {
            state.personalities = null;
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

        // Auto-open panel by default (user can close to dismiss)
        if (state.defaultOpen) {
            togglePanel(true);
        }
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
                <span class="chat-header-title">🐱 AI 游戏助手</span>
                <button class="chat-header-btn ${state.isPinned ? 'active' : ''}" id="btn-chat-pin" title="${state.isPinned ? '已固定 — 点击取消固定' : '固定面板 — 防止自动关闭'}">${state.isPinned ? '📍' : '📌'}</button>
                <button class="chat-header-btn" id="btn-chat-settings" title="AI 设置">⚙️</button>
                <button class="chat-header-btn" id="btn-chat-new" title="新对话">🔄</button>
                <button class="chat-header-btn ${state.ttsEnabled ? 'active' : ''} ${state.ttsEnabled && _ttsEngine === 'browser' ? 'tts-browser' : ''}" id="btn-chat-tts" title="语音播报">${state.ttsEnabled ? (_ttsEngine === 'edge' ? '🔊' : '🔉') : '🔇'}</button>
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
                            placeholder="https://api.openai.com/v1 (DeepSeek: https://api.deepseek.com/v1)"
                            value="${escapeAttr(state.settings.base_url)}">
                    </div>
                    <div class="chat-settings-divider"></div>
                    <div class="chat-settings-section-label">🎭 AI 个性</div>
                    <div class="chat-settings-row">
                        <label class="chat-settings-label">回复风格</label>
                        <select class="chat-settings-select" id="settings-personality">
                        </select>
                    </div>
                    <div class="chat-settings-divider"></div>
                    <div class="chat-settings-section-label">🔊 TTS 语音播报</div>
                    <div class="chat-settings-row">
                        <label class="chat-settings-label">语音</label>
                        <select class="chat-settings-select" id="settings-tts-voice">
                            ${Object.entries(TTS_VOICES).map(([key, v]) =>
                                `<option value="${key}" ${state.settings.tts_voice === key ? 'selected' : ''}>${v.label}</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div class="chat-settings-row">
                        <label class="chat-settings-label">语速</label>
                        <select class="chat-settings-select" id="settings-tts-rate">
                            <option value="-20%" ${state.settings.tts_rate === '-20%' ? 'selected' : ''}>慢速 -20%</option>
                            <option value="+0%" ${state.settings.tts_rate === '+0%' ? 'selected' : ''}>标准 +0%</option>
                            <option value="+15%" ${state.settings.tts_rate === '+15%' ? 'selected' : ''}>较快 +15%</option>
                            <option value="+30%" ${state.settings.tts_rate === '+30%' ? 'selected' : ''}>快速 +30%</option>
                        </select>
                    </div>
                </div>
                <div class="chat-settings-footer">
                    <span class="chat-settings-hint" id="settings-hint"></span>
                    <div class="chat-settings-actions">
                        <button class="btn btn-sm btn-danger-ghost" id="btn-clear-cache" title="清除所有聊天记录和设置">🗑️ 清除缓存</button>
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
            if (state.isOpen && !state.isPinned) togglePanel();
        });
        document.body.appendChild(backdrop);

        // Cache DOM refs
        els.panel = panel;
        els.messagesContainer = document.getElementById('chat-messages');
        els.input = document.getElementById('chat-input');
        els.sendBtn = document.getElementById('btn-chat-send');
        els.micBtn = document.getElementById('btn-chat-mic');
        els.ssBtn = document.getElementById('btn-chat-screenshot');
        els.pinBtn = document.getElementById('btn-chat-pin');
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

        // Pin button
        if (els.pinBtn) {
            els.pinBtn.addEventListener('click', togglePin);
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

        // Clear all cache
        document.getElementById('btn-clear-cache').addEventListener('click', clearAllCache);

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
        // Use capture phase to intercept before js-dos emulator steals keyboard
        els.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                const text = els.input.value.trim();
                if (text) sendMessage(text);
            }
        }, true);  // capture phase — beats js-dos event hijacking

        // Track when chat textarea has focus.
        // The document-level capture-phase keydown blocker (above) handles
        // preventing js-dos from hijacking keystrokes — no need to pause
        // the emulator. The game keeps running while typing.
        els.input.addEventListener('focus', () => {
            _chatInputFocused = true;
        });
        els.input.addEventListener('blur', () => {
            _chatInputFocused = false;
        });

        // Block js-dos keyboard capture when typing in chat.
        // js-dos v8 listens on `document` in capture phase for keydown events.
        // We register our blocker FIRST (before game.js creates the emulator)
        // and use stopImmediatePropagation to neuter js-dos's handler.
        document.addEventListener('keydown', (e) => {
            if (_chatInputFocused) {
                // Only block if the target is NOT our textarea (let typing through)
                // If target IS our textarea, we still need to block js-dos from
                // also receiving the event via its document capture handler.
                e.stopImmediatePropagation();
                // Do NOT stopPropagation — let the event reach the textarea normally
            }
        }, true);  // capture phase — must beat js-dos

        // Click anywhere on the input area, force focus to textarea
        els.inputArea.addEventListener('mousedown', (e) => {
            if (!_chatInputFocused && state.isOpen && !state.isWaiting) {
                els.input.focus();
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
                } else if (!state.isPinned && els.panel.contains(document.activeElement)) {
                    // Only close on Escape when NOT pinned
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

        // TTS fields
        const ttsVoice = document.getElementById('settings-tts-voice');
        const ttsRate = document.getElementById('settings-tts-rate');
        if (ttsVoice) ttsVoice.value = state.settings.tts_voice || TTS_DEFAULT_VOICE;
        if (ttsRate) ttsRate.value = state.settings.tts_rate || '+15%';

        // Populate personality dropdown
        const personalitySelect = document.getElementById('settings-personality');
        if (personalitySelect) {
            personalitySelect.innerHTML = '';
            const presets = state.personalities || {
                'wawa': { name: 'Wawa 热情' },
                'wawa-concise': { name: 'Wawa 简洁' },
            };
            Object.entries(presets).forEach(([key, info]) => {
                const opt = document.createElement('option');
                opt.value = key;
                opt.textContent = info.name;
                if (key === state.settings.personality) opt.selected = true;
                personalitySelect.appendChild(opt);
            });
        }

        // Show/hide base URL based on provider
        const baseUrlRow = document.getElementById('settings-baseurl-row');
        if (baseUrlRow) {
            baseUrlRow.style.display = state.settings.provider === 'openai' ? '' : 'none';
        }

        // Update model placeholder based on provider
        const modelInput = document.getElementById('settings-model');
        if (state.settings.provider === 'openai') {
            modelInput.placeholder = 'gpt-4o / deepseek-chat / deepseek-reasoner';
        } else {
            modelInput.placeholder = state.serverModel || 'claude-sonnet-4-20250514';
        }
    }

    function saveSettingsFromUI() {
        state.settings.provider = document.getElementById('settings-provider').value;
        state.settings.api_key = document.getElementById('settings-key').value.trim();
        state.settings.model = document.getElementById('settings-model').value.trim();
        state.settings.base_url = document.getElementById('settings-baseurl').value.trim();
        state.settings.personality = document.getElementById('settings-personality').value;
        state.settings.tts_voice = document.getElementById('settings-tts-voice').value;
        state.settings.tts_rate = document.getElementById('settings-tts-rate').value;

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
            modelInput.placeholder = prov === 'openai' ? 'gpt-4o / deepseek-chat / deepseek-reasoner' : (state.serverModel || 'claude-sonnet-4-20250514');
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
            if (hasUserConfig()) {
                els.statusDot.title = '使用自定义 API 密钥';
            } else if (state.localAIDefault) {
                els.statusDot.title = `本地 AI: ${state.localAIModel || 'gemma4:e4b'}`;
            } else {
                els.statusDot.title = '使用服务器 AI 配置';
            }
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
        } else if (state.localAIDefault) {
            els.configHint.textContent = '🏠 本地 AI (' + (state.localAIModel || 'gemma4:e4b') + ')';
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

    function togglePanel(forceOpen) {
        const wasOpen = state.isOpen;
        state.isOpen = (typeof forceOpen === 'boolean') ? forceOpen : !state.isOpen;

        // When user manually toggles, remember their preference
        if (typeof forceOpen !== 'boolean') {
            state.defaultOpen = state.isOpen;
            localStorage.setItem('chat_default_open', state.isOpen);
        }

        if (state.isOpen) {
            els.panel.classList.remove('hidden');
            // Shift page content right so chat panel doesn't block the game
            document.body.classList.add('chat-open');
            // Only show backdrop when NOT pinned (backdrop blocks game interaction)
            if (els.backdrop && !state.isPinned) {
                els.backdrop.classList.add('visible');
            }
            setTimeout(() => {
                els.input.focus();
                scrollToBottom();
            }, 300); // Wait for slide animation
        } else {
            els.panel.classList.add('hidden');
            document.body.classList.remove('chat-open');
            if (els.backdrop) els.backdrop.classList.remove('visible');
            // Close settings too
            if (state.isSettingsOpen) toggleSettings(false);
            // Resume emulator if it was paused for chat input
            if (window.DOS && window.DOS.Game && window.DOS.Game.resumeAfterInput) {
                window.DOS.Game.resumeAfterInput();
            }
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
    //  Pin / Auto-hide
    // ═══════════════════════════════════════════════════════════

    function togglePin() {
        state.isPinned = !state.isPinned;
        localStorage.setItem('chat_pinned', state.isPinned);

        // Update button appearance — change emoji shape + class
        if (els.pinBtn) {
            els.pinBtn.textContent = state.isPinned ? '📍' : '📌';
            els.pinBtn.classList.toggle('active', state.isPinned);
            els.pinBtn.title = state.isPinned ? '已固定 — 点击取消固定' : '固定面板 — 防止自动关闭';
        }

        // When pinning: hide backdrop so user can interact with the game
        // When unpinning: show backdrop so clicking outside closes the panel
        if (state.isOpen) {
            if (state.isPinned) {
                if (els.backdrop) els.backdrop.classList.remove('visible');
            } else {
                if (els.backdrop) els.backdrop.classList.add('visible');
            }
        }

        window.DOS.App.showToast(
            state.isPinned ? '📌 面板已固定 — 不会自动关闭' : '📍 面板已取消固定 — 点击外部自动关闭',
            'info'
        );
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
            // Sync CSS variable so body padding matches
            document.documentElement.style.setProperty('--chat-width', newWidth + 'px');
        }

        function onMouseUp() {
            handle.classList.remove('active');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            const width = els.panel.style.width;
            localStorage.setItem('chat_panel_width', width);
            document.documentElement.style.setProperty('--chat-width', width);
        }

        const savedWidth = localStorage.getItem('chat_panel_width');
        if (savedWidth) {
            els.panel.style.width = savedWidth;
            document.documentElement.style.setProperty('--chat-width', savedWidth);
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
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
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
    let _chatInputFocused = false;  // Track if chat textarea has focus (fight js-dos keyboard hijacking)

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
        console.log('[chat.js] sendMessage screenshot:',
            screenshot ? ('present, ' + screenshot.length + ' chars') : 'null/empty');
        state.lastScreenshot = null;
        els.ssBtn.classList.remove('screenshot-attached');

        const userMsg = { role: 'user', content: trimmed, timestamp: Date.now() };
        if (screenshot) userMsg._hasScreenshot = true;
        state.messages.push(userMsg);
        addMessageBubble('user', trimmed, !!screenshot);
        saveHistory();

        els.input.value = '';
        autoResizeInput();

        // Blur immediately to release keyboard back to the game.
        // (The focus handler pauses the emulator; we want the game to
        // keep running while AI responds and TTS speaks.)
        els.input.blur();

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
            }
            if (result.warning) {
                window.DOS.App.showToast('⚠️ ' + result.warning, 'warning', 6000);
            }
            if (!result.reply && result.error) {
                addSystemMessage(result.error, true);
            }
        } catch (err) {
            console.error('[chat.js] API call failed:', err);
            const msg = err.message || String(err);
            // Network-level error (server down, DNS, CORS) → generic message
            if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
                addSystemMessage('无法连接到服务器，请确认服务器正在运行', true);
            } else if (msg.includes('HTTP 5')) {
                addSystemMessage('服务器内部错误，请查看服务器日志', true);
            } else if (msg.includes('HTTP 4')) {
                addSystemMessage('请求错误 (' + msg + ')', true);
            } else {
                addSystemMessage(msg, true);
            }
        } finally {
            hideTyping();
            state.isWaiting = false;
            setInputEnabled(true);
            // Don't auto-refocus — let the user click the textarea when
            // they want to type again. This keeps the game running.
        }
    }

    async function callAI(messages, screenshot) {
        const apiMessages = messages.map(m => ({
            role: m.role,
            content: m.content,
        }));
        const trimmed = apiMessages.slice(-MAX_HISTORY);

        // Build request body with user settings + game context
        const body = {
            messages: trimmed,
            screenshot: screenshot || null,
            game_context: window.GAME_META || null,
        };

        // Include user AI config overrides if user has configured their own key
        if (hasUserConfig()) {
            body.api_key = state.settings.api_key;
            body.provider = state.settings.provider;
            if (state.settings.model) body.model = state.settings.model;
            if (state.settings.base_url) body.base_url = state.settings.base_url;
        }

        // Always send personality preference
        if (state.settings.personality) {
            body.personality = state.settings.personality;
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
                <div class="chat-welcome-icon">🐱</div>
                <div class="chat-welcome-title">你好！我是 Wawa</div>
                <div class="chat-welcome-text">
                    我是你的 AI 游戏助手。<br>
                    我可以看到你的游戏画面，帮你记住任务、解谜、提供攻略建议，或者只是陪你聊天。
                </div>
                ${state.localAIDefault ? `
                <div class="chat-welcome-config-note" style="border-color:rgba(34,197,94,0.3);background:rgba(34,197,94,0.08);color:var(--success);">
                    🏠 本地 AI 已就绪<br>
                    <small>使用 ${state.localAIModel || 'gemma4:e4b'} (Ollama)，完全离线运行</small>
                </div>` : (!isAIAvailable() ? `
                <div class="chat-welcome-config-note">
                    ⚠️ 尚未配置 AI 服务<br>
                    <small>点击上方 ⚙️ 按钮设置你的 API 密钥，或让管理员配置服务器密钥</small>
                </div>` : '')}
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

    // TTS engine preference: 'edge' (neural, server-side) | 'browser' (built-in)
    const TTS_ENGINE_KEY = 'chat_tts_engine';
    let _ttsEngine = localStorage.getItem(TTS_ENGINE_KEY) || 'edge';  // default to Edge neural
    let _activeAudio = null;  // Currently playing Edge TTS Audio element

    // Pre-load browser voices — they load asynchronously
    let _voicesLoaded = false;
    let _cachedZhVoice = null;

    function preloadVoices() {
        if (!window.speechSynthesis) return;
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
            _voicesLoaded = true;
            // Prefer a high-quality neural/natural voice, then any zh-CN/zh-TW
            _cachedZhVoice = voices.find(
                v => (v.lang.startsWith('zh-CN') || v.lang.startsWith('zh-TW'))
                    && (v.name.includes('Natural') || v.name.includes('Neural') || v.name.includes('Premium'))
            ) || voices.find(
                v => v.lang.startsWith('zh-CN') || v.lang.startsWith('zh-TW')
            ) || null;
            if (_cachedZhVoice) {
                console.log('[chat.js] Browser TTS voice:', _cachedZhVoice.name, _cachedZhVoice.lang);
            }
        }
    }

    if (window.speechSynthesis) {
        preloadVoices();
        window.speechSynthesis.addEventListener('voiceschanged', preloadVoices);
    }

    /**
     * Speak text using the selected TTS engine.
     * - Edge TTS: sends text to server, plays returned MP3 (neural, natural)
     * - Browser TTS: uses Web Speech API (offline, lower quality)
     */
    async function speakText(text) {
        if (!state.ttsEnabled) return;

        // Stop any ongoing audio
        stopSpeaking();

        // Strip markdown
        const cleanText = text
            .replace(/\*\*(.+?)\*\*/g, '$1')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/\n{2,}/g, '。')
            .replace(/\n/g, '。')
            .replace(/[#*\-–—>]/g, '')
            .trim();

        if (!cleanText) return;

        if (_ttsEngine === 'edge') {
            await speakWithEdgeTTS(cleanText);
        } else {
            speakWithBrowserTTS(cleanText);
        }
    }

    async function speakWithEdgeTTS(text) {
        const btn = document.getElementById('btn-chat-tts');
        if (btn) {
            btn.classList.add('tts-speaking');
            btn.title = 'Edge TTS 播报中...';
        }

        try {
            // Get configured voice from settings
            const voiceKey = (state.settings.tts_voice) || TTS_DEFAULT_VOICE;
            const voiceConfig = TTS_VOICES[voiceKey] || TTS_VOICES[TTS_DEFAULT_VOICE];
            const rate = state.settings.tts_rate || '+15%';

            const resp = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text, voice: voiceConfig.voice, rate: rate }),
            });

            if (!resp.ok) {
                throw new Error('TTS request failed: ' + resp.status);
            }

            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            _activeAudio = new Audio(url);
            _activeAudio.volume = 1.0;

            _activeAudio.addEventListener('ended', () => {
                URL.revokeObjectURL(url);
                _activeAudio = null;
                updateTTSSpeakingState(false);
            });

            _activeAudio.addEventListener('error', () => {
                URL.revokeObjectURL(url);
                _activeAudio = null;
                updateTTSSpeakingState(false);
            });

            await _activeAudio.play();
        } catch (e) {
            console.warn('[chat.js] Edge TTS failed, falling back to browser TTS:', e.message);
            // Fall back to browser TTS
            if (btn) btn.classList.remove('tts-speaking');
            speakWithBrowserTTS(text);
        }
    }

    function speakWithBrowserTTS(text) {
        if (!window.speechSynthesis) return;

        if (!_voicesLoaded) preloadVoices();

        const btn = document.getElementById('btn-chat-tts');
        if (btn && _ttsEngine !== 'edge') {
            btn.classList.add('tts-speaking');
            btn.title = '浏览器 TTS 播报中...';
        }

        // Split into sentences for more reliable browser TTS playback
        const sentences = text.split(/[。！？\.!\?]/).filter(s => s.trim());
        if (sentences.length === 0) {
            sentences.push(text);
        }

        let delay = 0;
        const totalSentences = sentences.length;
        let completed = 0;

        sentences.forEach((sentence, i) => {
            const trimmed = sentence.trim();
            if (!trimmed) {
                completed++;
                return;
            }

            setTimeout(() => {
                const utterance = new SpeechSynthesisUtterance(trimmed);
                utterance.lang = 'zh-CN';
                utterance.rate = 1.15;   // Slightly faster than default (was 0.9)
                utterance.pitch = 1.0;
                utterance.volume = 1.0;

                if (_cachedZhVoice) {
                    utterance.voice = _cachedZhVoice;
                }

                utterance.onend = () => {
                    completed++;
                    if (completed >= totalSentences) {
                        updateTTSSpeakingState(false);
                    }
                };
                utterance.onerror = () => {
                    completed++;
                    if (completed >= totalSentences) {
                        updateTTSSpeakingState(false);
                    }
                };

                window.speechSynthesis.speak(utterance);
            }, delay);

            // Faster pacing: ~3 chars/sec for Chinese
            delay += Math.max(800, trimmed.length * 200);
        });
    }

    function stopSpeaking() {
        // Stop Edge TTS audio
        if (_activeAudio) {
            _activeAudio.pause();
            _activeAudio = null;
        }
        // Stop browser TTS
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
    }

    function updateTTSSpeakingState(speaking) {
        const btn = document.getElementById('btn-chat-tts');
        if (!btn) return;

        if (speaking) {
            btn.classList.add('tts-speaking');
        } else {
            btn.classList.remove('tts-speaking');
            updateTTSButtonTitle();
        }
    }

    function updateTTSButtonTitle() {
        const btn = document.getElementById('btn-chat-tts');
        if (!btn) return;
        if (!state.ttsEnabled) {
            btn.title = '语音播报: 关';
        } else if (_ttsEngine === 'edge') {
            btn.title = '语音播报: Edge TTS (神经网络) — 点击切换';
        } else {
            btn.title = '语音播报: 浏览器内置 — 点击切换';
        }
    }

    function toggleTTS() {
        // Cycle: off → edge → browser → off
        if (!state.ttsEnabled) {
            state.ttsEnabled = true;
            _ttsEngine = 'edge';
        } else if (_ttsEngine === 'edge') {
            _ttsEngine = 'browser';
        } else {
            // browser → off
            state.ttsEnabled = false;
            stopSpeaking();
        }

        localStorage.setItem('chat_tts_enabled', state.ttsEnabled);
        localStorage.setItem(TTS_ENGINE_KEY, _ttsEngine);

        const btn = document.getElementById('btn-chat-tts');
        if (btn) {
            btn.classList.remove('tts-speaking', 'tts-browser');
            if (!state.ttsEnabled) {
                // Off: muted speaker
                btn.textContent = '🔇';
                btn.classList.remove('active');
            } else if (_ttsEngine === 'edge') {
                // Edge TTS: loud speaker (high quality)
                btn.textContent = '🔊';
                btn.classList.add('active');
            } else {
                // Browser TTS: low speaker (lower quality)
                btn.textContent = '🔉';
                btn.classList.add('active', 'tts-browser');
            }
            updateTTSButtonTitle();
        }

        // Show toast for current state
        if (!state.ttsEnabled) {
            window.DOS.App.showToast('🔇 语音播报已关闭', 'info');
        } else if (_ttsEngine === 'edge') {
            window.DOS.App.showToast('🔊 Edge TTS 神经网络语音 (免费)', 'success');
            speakText('语音播报已开启');
        } else {
            window.DOS.App.showToast('🔉 浏览器内置语音 (离线)', 'info');
            speakText('语音播报已开启');
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

    function clearAllCache() {
        if (!confirm('确定要清除所有 AI 聊天缓存吗？\n\n这将删除：\n• 所有游戏的对话历史\n• AI 设置（密钥、模型等）\n• 语音播报偏好\n• 面板固定状态\n\n此操作不可撤销！')) return;

        // Clear all chat history keys (all games)
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('chat_history_')) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));

        // Clear settings & preferences
        localStorage.removeItem(SETTINGS_KEY);
        localStorage.removeItem(TTS_ENGINE_KEY);
        localStorage.removeItem('chat_tts_enabled');
        localStorage.removeItem('chat_pinned');
        localStorage.removeItem('chat_auto_screenshot');
        localStorage.removeItem('chat_panel_width');
        localStorage.removeItem('chat_default_open');

        // Reset current state
        state.messages = [];
        state.lastScreenshot = null;
        state.settings = defaultSettings();
        state.ttsEnabled = false;
        state.isPinned = false;
        state.defaultOpen = true;
        state.autoScreenshot = false;
        _ttsEngine = 'edge';

        // Update UI
        els.messagesContainer.innerHTML = '';
        showWelcome();
        if (els.pinBtn) {
            els.pinBtn.textContent = '📌';
            els.pinBtn.classList.remove('active');
        }

        // Update TTS button
        const ttsBtn = document.getElementById('btn-chat-tts');
        if (ttsBtn) {
            ttsBtn.textContent = '🔇';
            ttsBtn.classList.remove('active', 'tts-browser', 'tts-speaking');
        }

        // Update auto-screenshot toggle
        const autoSsToggle = document.getElementById('toggle-auto-ss');
        if (autoSsToggle) autoSsToggle.classList.remove('active');

        // Stop auto-screenshot
        stopAutoScreenshot();

        // Reset panel width
        els.panel.style.width = '';
        document.documentElement.style.setProperty('--chat-width', '360px');

        // Close settings
        toggleSettings(false);

        // Update indicators
        updateStatusIndicator();
        updateConfigHint();

        window.DOS.App.showToast('🗑️ 所有聊天缓存已清除', 'success');
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
        stopSpeaking();
    });

    // ═══════════════════════════════════════════════════════════
    //  Start
    // ═══════════════════════════════════════════════════════════

    document.addEventListener('DOMContentLoaded', init);
})();
