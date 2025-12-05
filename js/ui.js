/**
 * RemYA - UI Module
 * Gestion de l'interface utilisateur
 */

const UI = (function() {
    // ============================================
    // DOM Elements
    // ============================================

    const elements = {
        // Sidebar
        sidebar: null,
        overlay: null,
        menuBtn: null,
        newChatBtn: null,
        searchConversations: null,
        conversationsList: null,
        modelSelect: null,
        settingsBtn: null,
        themeToggle: null,
        serverStatus: null,

        // Main
        welcome: null,
        messages: null,
        chatContainer: null,
        messageInput: null,
        sendBtn: null,
        stopBtn: null,
        attachBtn: null,
        fileInput: null,
        scrollToBottomBtn: null,

        // Header
        commandPaletteBtn: null,

        // Modals
        commandPalette: null,
        commandSearch: null,
        commandList: null,
        settingsModal: null
    };

    // State pour le scroll
    let userHasScrolled = false;
    let isGenerating = false;
    let lastRenderTime = 0;
    const RENDER_THROTTLE = 50; // ms entre chaque rendu

    // ============================================
    // Initialisation
    // ============================================

    function init() {
        cacheElements();
        applyTheme();
        loadUserSettings();
    }

    function cacheElements() {
        elements.sidebar = document.getElementById('sidebar');
        elements.overlay = document.getElementById('overlay');
        elements.menuBtn = document.getElementById('menuBtn');
        elements.newChatBtn = document.getElementById('newChatBtn');
        elements.searchConversations = document.getElementById('searchConversations');
        elements.conversationsList = document.getElementById('conversationsList');
        elements.modelSelect = document.getElementById('modelSelect');
        elements.settingsBtn = document.getElementById('settingsBtn');
        elements.themeToggle = document.getElementById('themeToggle');
        elements.serverStatus = document.getElementById('serverStatus');

        elements.welcome = document.getElementById('welcome');
        elements.messages = document.getElementById('messages');
        elements.chatContainer = document.querySelector('.chat-container');
        elements.messageInput = document.getElementById('messageInput');
        elements.sendBtn = document.getElementById('sendBtn');
        elements.stopBtn = document.getElementById('stopBtn');
        elements.attachBtn = document.getElementById('attachBtn');
        elements.fileInput = document.getElementById('fileInput');
        elements.scrollToBottomBtn = document.getElementById('scrollToBottom');

        elements.commandPaletteBtn = document.getElementById('commandPaletteBtn');
        elements.commandPalette = document.getElementById('commandPalette');
        elements.commandSearch = document.getElementById('commandSearch');
        elements.commandList = document.getElementById('commandList');
        elements.settingsModal = document.getElementById('settingsModal');

        // Bind scroll events
        if (elements.chatContainer) {
            elements.chatContainer.addEventListener('scroll', handleScroll);
        }
        if (elements.scrollToBottomBtn) {
            elements.scrollToBottomBtn.addEventListener('click', () => {
                scrollToBottom(true);
                userHasScrolled = false;
            });
        }
    }

    function handleScroll() {
        if (!elements.chatContainer) return;

        const { scrollTop, scrollHeight, clientHeight } = elements.chatContainer;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

        // Si l'utilisateur scroll pendant la génération
        if (isGenerating && distanceFromBottom > 100) {
            userHasScrolled = true;
        }

        // Afficher/masquer le bouton scroll-to-bottom
        if (elements.scrollToBottomBtn) {
            if (distanceFromBottom > 200) {
                elements.scrollToBottomBtn.classList.add('visible');
            } else {
                elements.scrollToBottomBtn.classList.remove('visible');
                userHasScrolled = false;
            }
        }
    }

    function applyTheme() {
        const theme = Storage.getTheme();
        document.documentElement.setAttribute('data-theme', theme);
        updateThemeIcons(theme);
    }

    function loadUserSettings() {
        const settings = Storage.getSettings();

        // Appliquer le modèle
        if (elements.modelSelect) {
            elements.modelSelect.value = settings.model || 'mistral:7b-instruct-v0.2-q5_K_M';
        }
    }

    // ============================================
    // Sidebar
    // ============================================

    function toggleSidebar() {
        elements.sidebar.classList.toggle('open');
        elements.overlay.classList.toggle('show');
    }

    function closeSidebar() {
        elements.sidebar.classList.remove('open');
        elements.overlay.classList.remove('show');
    }

    function renderConversationsList(conversations, currentId = null) {
        if (!elements.conversationsList) return;

        if (!conversations || conversations.length === 0) {
            elements.conversationsList.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
                    <p>Aucune conversation</p>
                    <p style="font-size: 12px; margin-top: 8px;">Commence par écrire un message !</p>
                </div>
            `;
            return;
        }

        // Grouper par date
        const groups = groupConversationsByDate(conversations);
        let html = '';

        for (const [groupName, convs] of Object.entries(groups)) {
            html += `
                <div class="conversation-group">
                    <div class="conversation-group-title">${groupName}</div>
                    ${convs.map(conv => `
                        <div class="conversation-item ${conv.id === currentId ? 'active' : ''}"
                             data-id="${conv.id}">
                            <span class="conv-icon">💬</span>
                            <span class="conv-title">${escapeHtml(conv.title)}</span>
                            <button class="conv-delete" data-id="${conv.id}" title="Supprimer">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                            </button>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        elements.conversationsList.innerHTML = html;
    }

    function groupConversationsByDate(conversations) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const yesterday = today - 86400000;
        const lastWeek = today - 7 * 86400000;

        const groups = {
            "Aujourd'hui": [],
            "Hier": [],
            "7 derniers jours": [],
            "Plus ancien": []
        };

        conversations.forEach(conv => {
            const date = conv.updatedAt || conv.createdAt;
            if (date >= today) {
                groups["Aujourd'hui"].push(conv);
            } else if (date >= yesterday) {
                groups["Hier"].push(conv);
            } else if (date >= lastWeek) {
                groups["7 derniers jours"].push(conv);
            } else {
                groups["Plus ancien"].push(conv);
            }
        });

        // Retirer les groupes vides
        for (const key of Object.keys(groups)) {
            if (groups[key].length === 0) {
                delete groups[key];
            }
        }

        return groups;
    }

    // ============================================
    // Messages
    // ============================================

    function showWelcome() {
        elements.welcome.style.display = 'flex';
        elements.messages.classList.remove('active');
    }

    function hideWelcome() {
        elements.welcome.style.display = 'none';
        elements.messages.classList.add('active');
    }

    function clearMessages() {
        elements.messages.innerHTML = '';
    }

    function createMessage(role, content = '', options = {}) {
        hideWelcome();

        const msg = document.createElement('div');
        msg.className = `message ${role}`;
        if (options.id) msg.dataset.id = options.id;

        const settings = Storage.getSettings();
        const userName = settings.userName || 'Rémy';
        const time = options.timestamp ? formatTime(options.timestamp) : formatTime(Date.now());

        msg.innerHTML = `
            <div class="message-avatar">${role === 'user' ? userName.charAt(0).toUpperCase() : '⚡'}</div>
            <div class="message-body">
                <div class="message-header">
                    <span class="message-author">${role === 'user' ? userName : 'RemYA'}</span>
                    <span class="message-time">${time}</span>
                    <div class="message-actions">
                        ${role === 'ai' ? `
                            <button class="message-action-btn copy-btn" title="Copier">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                </svg>
                            </button>
                            <button class="message-action-btn regenerate-btn" title="Régénérer">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="23 4 23 10 17 10"></polyline>
                                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                                </svg>
                            </button>
                        ` : `
                            <button class="message-action-btn edit-btn" title="Modifier">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </button>
                        `}
                    </div>
                </div>
                <div class="message-content"></div>
            </div>
        `;

        const contentEl = msg.querySelector('.message-content');

        if (content === 'loading') {
            contentEl.innerHTML = `
                <div class="typing-indicator">
                    <span></span><span></span><span></span>
                </div>
            `;
        } else if (role === 'ai') {
            contentEl.innerHTML = parseMarkdown(content);
            highlightCode(contentEl);
        } else {
            contentEl.textContent = content;
        }

        elements.messages.appendChild(msg);
        scrollToBottom();

        return contentEl;
    }

    function updateMessageContent(contentEl, content, forceRender = false) {
        const now = Date.now();

        // Throttle les rendus pour plus de fluidité
        if (!forceRender && now - lastRenderTime < RENDER_THROTTLE) {
            return;
        }
        lastRenderTime = now;

        // Utiliser requestAnimationFrame pour un rendu plus fluide
        requestAnimationFrame(() => {
            contentEl.innerHTML = parseMarkdown(content);
            highlightCode(contentEl);
            scrollToBottom();
        });
    }

    function createSystemMessage(content, type = 'info') {
        const msg = document.createElement('div');
        msg.className = `system-message ${type}`;
        msg.innerHTML = content;
        elements.messages.appendChild(msg);
        scrollToBottom();
        return msg;
    }

    function scrollToBottom(force = false) {
        if (!elements.chatContainer) return;

        // Ne pas scroller si l'utilisateur a scrollé manuellement (sauf si force=true)
        if (userHasScrolled && !force) return;

        elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
    }

    function loadConversationMessages(messages) {
        clearMessages();
        if (!messages || messages.length === 0) {
            showWelcome();
            return;
        }

        hideWelcome();
        messages.forEach(msg => {
            createMessage(msg.role, msg.content, {
                id: msg.id,
                timestamp: msg.timestamp
            });
        });
    }

    // ============================================
    // Markdown & Code Highlighting
    // ============================================

    function parseMarkdown(content) {
        if (!content) return '';

        // Configuration de marked
        if (typeof marked !== 'undefined') {
            marked.setOptions({
                breaks: true,
                gfm: true,
                headerIds: false
            });

            // Renderer personnalisé pour les blocs de code
            const renderer = new marked.Renderer();
            renderer.code = function(codeOrObj, language) {
                // Support marked v4+ (objet) et versions antérieures (paramètres séparés)
                let code, lang;
                if (typeof codeOrObj === 'object' && codeOrObj !== null) {
                    code = codeOrObj.text || codeOrObj.code || '';
                    lang = codeOrObj.lang || codeOrObj.language || 'plaintext';
                } else {
                    code = codeOrObj || '';
                    lang = language || 'plaintext';
                }
                return `
                    <div class="code-block-header">
                        <span>${lang}</span>
                        <button class="copy-code-btn" onclick="UI.copyCode(this)">Copier</button>
                    </div>
                    <pre><code class="language-${lang}">${escapeHtml(code)}</code></pre>
                `;
            };

            return marked.parse(content, { renderer });
        }

        return escapeHtml(content).replace(/\n/g, '<br>');
    }

    function highlightCode(container) {
        if (typeof Prism !== 'undefined') {
            container.querySelectorAll('pre code').forEach(block => {
                Prism.highlightElement(block);
            });
        }
    }

    function copyCode(button) {
        const codeBlock = button.closest('.code-block-header').nextElementSibling;
        const code = codeBlock.querySelector('code').textContent;

        navigator.clipboard.writeText(code).then(() => {
            const originalText = button.textContent;
            button.textContent = 'Copié !';
            setTimeout(() => {
                button.textContent = originalText;
            }, 2000);
        });
    }

    // ============================================
    // Input
    // ============================================

    function focusInput() {
        if (elements.messageInput) {
            elements.messageInput.focus();
        }
    }

    function clearInput() {
        if (elements.messageInput) {
            elements.messageInput.value = '';
            elements.messageInput.style.height = 'auto';
            updateSendButton();
        }
    }

    function getInputValue() {
        return elements.messageInput ? elements.messageInput.value.trim() : '';
    }

    function setInputValue(value) {
        if (elements.messageInput) {
            elements.messageInput.value = value;
            autoResizeTextarea(elements.messageInput);
            updateSendButton();
        }
    }

    function updateSendButton() {
        if (elements.sendBtn && elements.messageInput) {
            elements.sendBtn.disabled = !elements.messageInput.value.trim();
        }
    }

    function autoResizeTextarea(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }

    function setSendingState(isSending) {
        isGenerating = isSending;
        userHasScrolled = false;

        const inputContainer = document.querySelector('.input-container');

        if (elements.sendBtn) {
            elements.sendBtn.style.display = isSending ? 'none' : 'flex';
        }
        if (elements.stopBtn) {
            elements.stopBtn.style.display = isSending ? 'flex' : 'none';
        }
        if (inputContainer) {
            inputContainer.classList.toggle('generating', isSending);
        }
        if (elements.messageInput) {
            elements.messageInput.disabled = isSending;
        }
    }

    // ============================================
    // Theme
    // ============================================

    function toggleTheme() {
        const newTheme = Storage.toggleTheme();
        updateThemeIcons(newTheme);
        return newTheme;
    }

    function updateThemeIcons(theme) {
        const darkIcon = document.querySelector('.theme-icon-dark');
        const lightIcon = document.querySelector('.theme-icon-light');

        if (darkIcon && lightIcon) {
            if (theme === 'dark') {
                darkIcon.style.display = 'block';
                lightIcon.style.display = 'none';
            } else {
                darkIcon.style.display = 'none';
                lightIcon.style.display = 'block';
            }
        }
    }

    // ============================================
    // Command Palette
    // ============================================

    function showCommandPalette() {
        elements.commandPalette.classList.add('show');
        elements.commandSearch.value = '';
        elements.commandSearch.focus();
        filterCommands('');
    }

    function hideCommandPalette() {
        elements.commandPalette.classList.remove('show');
    }

    function toggleCommandPalette() {
        if (elements.commandPalette.classList.contains('show')) {
            hideCommandPalette();
        } else {
            showCommandPalette();
        }
    }

    function filterCommands(query) {
        const items = elements.commandList.querySelectorAll('.command-item');
        const normalizedQuery = query.toLowerCase().trim();

        items.forEach(item => {
            const name = item.querySelector('.command-name').textContent.toLowerCase();
            if (normalizedQuery === '' || name.includes(normalizedQuery)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    }

    // ============================================
    // Settings Modal
    // ============================================

    function showSettings() {
        elements.settingsModal.classList.add('show');
        loadUserSettings();
    }

    function hideSettings() {
        elements.settingsModal.classList.remove('show');
    }

    // ============================================
    // Status
    // ============================================

    function setServerStatus(connected) {
        if (elements.serverStatus) {
            elements.serverStatus.classList.toggle('connected', connected);
            elements.serverStatus.title = connected ? 'Backend connecté' : 'Backend déconnecté';
        }
    }

    // ============================================
    // Notifications
    // ============================================

    function showNotification(message, type = 'info', duration = 3000) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <span>${escapeHtml(message)}</span>
            <button class="notification-close">&times;</button>
        `;

        notification.style.cssText = `
            position: fixed;
            bottom: 100px;
            right: 20px;
            padding: 12px 20px;
            background: var(--bg-secondary);
            border: 1px solid var(--${type === 'error' ? 'error' : type === 'success' ? 'success' : 'accent'});
            border-radius: var(--radius-md);
            color: var(--text-primary);
            display: flex;
            align-items: center;
            gap: 12px;
            z-index: 1000;
            animation: fadeUp 0.3s ease;
        `;

        document.body.appendChild(notification);

        const close = () => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        };

        notification.querySelector('.notification-close').onclick = close;
        if (duration > 0) {
            setTimeout(close, duration);
        }

        return notification;
    }

    // ============================================
    // Utilitaires
    // ============================================

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    // ============================================
    // API Publique
    // ============================================

    return {
        init,
        elements,

        // Sidebar
        toggleSidebar,
        closeSidebar,
        renderConversationsList,

        // Messages
        showWelcome,
        hideWelcome,
        clearMessages,
        createMessage,
        updateMessageContent,
        createSystemMessage,
        scrollToBottom,
        loadConversationMessages,

        // Markdown
        parseMarkdown,
        highlightCode,
        copyCode,

        // Input
        focusInput,
        clearInput,
        getInputValue,
        setInputValue,
        updateSendButton,
        autoResizeTextarea,
        setSendingState,

        // Theme
        toggleTheme,

        // Command Palette
        showCommandPalette,
        hideCommandPalette,
        toggleCommandPalette,
        filterCommands,

        // Settings
        showSettings,
        hideSettings,
        loadUserSettings,

        // Status
        setServerStatus,

        // Notifications
        showNotification,

        // Utils
        escapeHtml,
        formatTime
    };
})();
