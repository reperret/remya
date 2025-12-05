/**
 * RemYA - Main Application
 * Point d'entrée et orchestration
 */

const App = (function() {
    let currentConversationId = null;
    let isGenerating = false;

    // ============================================
    // Initialisation
    // ============================================

    function init() {
        UI.init();
        bindEvents();
        loadState();
        checkConnections();

        // Vérifier les connexions périodiquement
        setInterval(checkConnections, 30000);

        console.log('🚀 RemYA initialisé');
    }

    function loadState() {
        // Charger les conversations
        const conversations = Storage.getConversations();
        UI.renderConversationsList(conversations, currentConversationId);

        // Charger la conversation courante si elle existe
        currentConversationId = Storage.getCurrentConversationId();
        if (currentConversationId) {
            loadConversation(currentConversationId);
        }
    }

    async function checkConnections() {
        const backendConnected = await API.checkBackendConnection();
        UI.setServerStatus(backendConnected);

        // Optionnel: charger les modèles disponibles
        if (await API.checkOllamaConnection()) {
            const result = await API.getModels();
            if (result.success && result.models.length > 0) {
                updateModelSelector(result.models);
            }
        }
    }

    function updateModelSelector(models) {
        const select = UI.elements.modelSelect;
        if (!select) return;

        const currentValue = select.value;
        select.innerHTML = models.map(model =>
            `<option value="${model.name}">${model.name}</option>`
        ).join('');

        // Restaurer la sélection si possible
        if (models.some(m => m.name === currentValue)) {
            select.value = currentValue;
        }
    }

    // ============================================
    // Event Bindings
    // ============================================

    function bindEvents() {
        // Sidebar
        UI.elements.menuBtn?.addEventListener('click', UI.toggleSidebar);
        UI.elements.overlay?.addEventListener('click', UI.closeSidebar);
        UI.elements.newChatBtn?.addEventListener('click', newChat);
        UI.elements.searchConversations?.addEventListener('input', handleSearchConversations);

        // Conversations list delegation
        UI.elements.conversationsList?.addEventListener('click', handleConversationClick);

        // Model selector
        UI.elements.modelSelect?.addEventListener('change', handleModelChange);

        // Theme toggle
        UI.elements.themeToggle?.addEventListener('click', UI.toggleTheme);

        // Settings
        UI.elements.settingsBtn?.addEventListener('click', UI.showSettings);
        document.getElementById('closeSettings')?.addEventListener('click', UI.hideSettings);
        document.getElementById('clearAllData')?.addEventListener('click', handleClearAllData);

        // Settings inputs
        document.getElementById('ollamaUrl')?.addEventListener('change', saveSettingsFromInputs);
        document.getElementById('backendUrl')?.addEventListener('change', saveSettingsFromInputs);
        document.getElementById('userName')?.addEventListener('change', saveSettingsFromInputs);
        document.getElementById('enterToSend')?.addEventListener('change', saveSettingsFromInputs);
        document.getElementById('enableSounds')?.addEventListener('change', saveSettingsFromInputs);

        // Message input
        UI.elements.messageInput?.addEventListener('input', function() {
            UI.autoResizeTextarea(this);
            UI.updateSendButton();
        });

        UI.elements.messageInput?.addEventListener('keydown', function(e) {
            const settings = Storage.getSettings();
            if (e.key === 'Enter' && !e.shiftKey && settings.enterToSend !== false) {
                e.preventDefault();
                if (!UI.elements.sendBtn.disabled && !isGenerating) {
                    sendMessage();
                }
            }
        });

        // Send button
        UI.elements.sendBtn?.addEventListener('click', sendMessage);

        // Attach file
        UI.elements.attachBtn?.addEventListener('click', () => UI.elements.fileInput?.click());
        UI.elements.fileInput?.addEventListener('change', handleFileAttach);

        // Command palette
        UI.elements.commandPaletteBtn?.addEventListener('click', UI.toggleCommandPalette);
        UI.elements.commandSearch?.addEventListener('input', (e) => UI.filterCommands(e.target.value));
        UI.elements.commandList?.addEventListener('click', handleCommandClick);

        // Modal backdrops
        document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
            backdrop.addEventListener('click', function() {
                this.closest('.modal').classList.remove('show');
            });
        });

        // Welcome capabilities
        document.querySelectorAll('.capability').forEach(cap => {
            cap.addEventListener('click', function() {
                const suggestion = this.dataset.suggestion;
                if (suggestion) {
                    UI.setInputValue(suggestion);
                    UI.focusInput();
                }
            });
        });

        // Messages delegation (copy, regenerate, edit)
        UI.elements.messages?.addEventListener('click', handleMessageAction);

        // Keyboard shortcuts
        document.addEventListener('keydown', handleKeyboardShortcuts);
    }

    // ============================================
    // Conversations
    // ============================================

    function newChat() {
        currentConversationId = null;
        Storage.setCurrentConversationId(null);

        UI.clearMessages();
        UI.showWelcome();
        UI.clearInput();
        UI.closeSidebar();

        // Mettre à jour la liste
        const conversations = Storage.getConversations();
        UI.renderConversationsList(conversations, null);
    }

    function loadConversation(id) {
        const conversation = Storage.getConversation(id);
        if (!conversation) return;

        currentConversationId = id;
        Storage.setCurrentConversationId(id);

        UI.loadConversationMessages(conversation.messages);
        UI.closeSidebar();

        // Mettre à jour la liste active
        const conversations = Storage.getConversations();
        UI.renderConversationsList(conversations, id);
    }

    function handleConversationClick(e) {
        const deleteBtn = e.target.closest('.conv-delete');
        if (deleteBtn) {
            e.stopPropagation();
            const id = deleteBtn.dataset.id;
            if (confirm('Supprimer cette conversation ?')) {
                Storage.deleteConversation(id);
                if (id === currentConversationId) {
                    newChat();
                } else {
                    const conversations = Storage.getConversations();
                    UI.renderConversationsList(conversations, currentConversationId);
                }
            }
            return;
        }

        const item = e.target.closest('.conversation-item');
        if (item) {
            loadConversation(item.dataset.id);
        }
    }

    function handleSearchConversations(e) {
        const query = e.target.value;
        const conversations = Storage.searchConversations(query);
        UI.renderConversationsList(conversations, currentConversationId);
    }

    // ============================================
    // Messages
    // ============================================

    async function sendMessage() {
        const text = UI.getInputValue();
        if (!text || isGenerating) return;

        isGenerating = true;
        UI.setSendingState(true);

        // Créer une nouvelle conversation si nécessaire
        if (!currentConversationId) {
            const conv = Storage.createConversation(text);
            currentConversationId = conv.id;
        }

        // Ajouter le message utilisateur
        UI.createMessage('user', text);
        Storage.addMessageToConversation(currentConversationId, {
            role: 'user',
            content: text
        });

        UI.clearInput();

        // Préparer le placeholder pour la réponse
        const aiContent = UI.createMessage('ai', 'loading');

        // ========================================
        // DÉTECTION ET EXÉCUTION DES OUTILS
        // ========================================
        let toolResult = null;
        let contextMessage = text;

        // Vérifier si le backend est connecté
        const backendConnected = await API.checkBackendConnection();

        if (backendConnected && typeof Tools !== 'undefined') {
            try {
                toolResult = await Tools.detectAndExecute(text);

                if (toolResult.detected) {
                    console.log('[App] Outil exécuté:', toolResult.intent, toolResult.result);

                    // Si on a un résultat, l'afficher directement ou enrichir le contexte
                    if (toolResult.result.message) {
                        // Afficher le résultat directement (l'IA va reformuler)
                        contextMessage = `L'utilisateur a demandé: "${text}"

J'ai exécuté l'action "${toolResult.intent}" et voici le résultat:

${toolResult.result.message}

Reformule ce résultat de façon naturelle et conversationnelle pour l'utilisateur. Si pertinent, fais des suggestions ou observations utiles.`;
                    } else if (toolResult.result.error) {
                        contextMessage = `L'utilisateur a demandé: "${text}"

J'ai tenté d'exécuter l'action "${toolResult.intent}" mais une erreur s'est produite:
${toolResult.result.error}

Explique cette erreur à l'utilisateur de façon simple et propose des solutions si possible.`;
                    }
                }
            } catch (e) {
                console.error('[App] Erreur détection outils:', e);
            }
        }

        // Récupérer l'historique pour le contexte
        const conversation = Storage.getConversation(currentConversationId);

        // Construire les messages avec le system prompt
        const messages = [];

        // Ajouter le system prompt
        if (typeof Tools !== 'undefined') {
            messages.push({
                role: 'system',
                content: Tools.buildSystemPrompt()
            });
        }

        // Ajouter l'historique (sauf le dernier message qu'on va modifier)
        const historyMessages = conversation.messages.slice(0, -1).map(m => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content
        }));
        messages.push(...historyMessages);

        // Ajouter le message enrichi avec le contexte des outils
        messages.push({
            role: 'user',
            content: contextMessage
        });

        // Appeler l'API
        const result = await API.chat(messages, (fullText, chunk) => {
            UI.updateMessageContent(aiContent, fullText);
        });

        if (result.success) {
            // Sauvegarder la réponse
            Storage.addMessageToConversation(currentConversationId, {
                role: 'assistant',
                content: result.content
            });
        } else if (!result.aborted) {
            // Si Ollama n'est pas disponible mais qu'on a un résultat d'outil, l'afficher quand même
            if (toolResult?.result?.message) {
                UI.updateMessageContent(aiContent, toolResult.result.message);
                Storage.addMessageToConversation(currentConversationId, {
                    role: 'assistant',
                    content: toolResult.result.message
                });
            } else {
                aiContent.innerHTML = `
                    <div class="system-message error">
                        ❌ ${UI.escapeHtml(result.error || 'Erreur de connexion')}
                        <br><small>Vérifie que Ollama est lancé (ollama serve)</small>
                    </div>
                `;
            }
        }

        isGenerating = false;
        UI.setSendingState(false);

        // Mettre à jour la liste des conversations
        const conversations = Storage.getConversations();
        UI.renderConversationsList(conversations, currentConversationId);
    }

    async function regenerateLastResponse() {
        if (isGenerating || !currentConversationId) return;

        const conversation = Storage.getConversation(currentConversationId);
        if (!conversation || conversation.messages.length < 2) return;

        // Trouver le dernier message utilisateur
        let lastUserIndex = -1;
        for (let i = conversation.messages.length - 1; i >= 0; i--) {
            if (conversation.messages[i].role === 'user') {
                lastUserIndex = i;
                break;
            }
        }

        if (lastUserIndex === -1) return;

        // Supprimer la dernière réponse AI
        conversation.messages = conversation.messages.slice(0, lastUserIndex + 1);
        Storage.updateConversation(currentConversationId, { messages: conversation.messages });

        // Recharger et régénérer
        UI.loadConversationMessages(conversation.messages);

        isGenerating = true;
        UI.setSendingState(true);

        const aiContent = UI.createMessage('ai', 'loading');

        const messages = conversation.messages.map(m => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content
        }));

        const result = await API.chat(messages, (fullText) => {
            UI.updateMessageContent(aiContent, fullText);
        });

        if (result.success) {
            Storage.addMessageToConversation(currentConversationId, {
                role: 'assistant',
                content: result.content
            });
        }

        isGenerating = false;
        UI.setSendingState(false);
    }

    function handleMessageAction(e) {
        const copyBtn = e.target.closest('.copy-btn');
        if (copyBtn) {
            const content = copyBtn.closest('.message').querySelector('.message-content').textContent;
            navigator.clipboard.writeText(content).then(() => {
                UI.showNotification('Copié dans le presse-papier', 'success');
            });
            return;
        }

        const regenerateBtn = e.target.closest('.regenerate-btn');
        if (regenerateBtn) {
            regenerateLastResponse();
            return;
        }
    }

    // ============================================
    // Commands
    // ============================================

    function handleCommandClick(e) {
        const item = e.target.closest('.command-item');
        if (!item) return;

        const command = item.dataset.command;
        UI.hideCommandPalette();

        executeCommand(command);
    }

    async function executeCommand(command) {
        switch (command) {
            case 'new-chat':
                newChat();
                break;

            case 'clear-chat':
                if (currentConversationId && confirm('Effacer cette conversation ?')) {
                    Storage.updateConversation(currentConversationId, { messages: [] });
                    UI.clearMessages();
                    UI.showWelcome();
                }
                break;

            case 'export-chat':
                exportCurrentChat();
                break;

            case 'toggle-theme':
                UI.toggleTheme();
                break;

            case 'change-model':
                UI.elements.modelSelect?.focus();
                break;

            case 'list-files':
                UI.setInputValue('Liste les fichiers de mon bureau');
                UI.focusInput();
                break;

            case 'system-info':
                UI.setInputValue('Donne-moi les informations système de mon PC');
                UI.focusInput();
                break;

            case 'open-folder':
                UI.setInputValue('Ouvre le dossier Documents');
                UI.focusInput();
                break;
        }
    }

    function exportCurrentChat() {
        if (!currentConversationId) {
            UI.showNotification('Aucune conversation à exporter', 'error');
            return;
        }

        const conversation = Storage.getConversation(currentConversationId);
        if (!conversation) return;

        let markdown = `# ${conversation.title}\n\n`;
        markdown += `*Exporté le ${new Date().toLocaleString('fr-FR')}*\n\n---\n\n`;

        conversation.messages.forEach(msg => {
            const author = msg.role === 'user' ? 'Vous' : 'RemYA';
            markdown += `### ${author}\n\n${msg.content}\n\n---\n\n`;
        });

        const blob = new Blob([markdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `remya-${conversation.title.substring(0, 30).replace(/[^a-z0-9]/gi, '-')}.md`;
        a.click();
        URL.revokeObjectURL(url);

        UI.showNotification('Conversation exportée', 'success');
    }

    // ============================================
    // Settings
    // ============================================

    function handleModelChange(e) {
        Storage.updateSettings({ model: e.target.value });
    }

    function saveSettingsFromInputs() {
        const settings = {
            ollamaUrl: document.getElementById('ollamaUrl')?.value || 'http://localhost:11434',
            backendUrl: document.getElementById('backendUrl')?.value || 'http://localhost:3456',
            userName: document.getElementById('userName')?.value || 'Rémy',
            enterToSend: document.getElementById('enterToSend')?.checked !== false,
            enableSounds: document.getElementById('enableSounds')?.checked || false
        };

        Storage.saveSettings(settings);
        UI.loadUserSettings();
        UI.showNotification('Paramètres sauvegardés', 'success');
    }

    function handleClearAllData() {
        if (confirm('Supprimer TOUTES les données ? Cette action est irréversible.')) {
            Storage.clearAllData();
            location.reload();
        }
    }

    // ============================================
    // Files
    // ============================================

    async function handleFileAttach(e) {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const file = files[0];
        const reader = new FileReader();

        reader.onload = function(event) {
            const content = event.target.result;
            const prompt = `Voici le contenu du fichier "${file.name}":\n\n\`\`\`\n${content}\n\`\`\`\n\nAnalyse ce fichier et dis-moi ce que tu en penses.`;
            UI.setInputValue(prompt);
            UI.focusInput();
        };

        reader.readAsText(file);
        e.target.value = ''; // Reset input
    }

    // ============================================
    // Keyboard Shortcuts
    // ============================================

    function handleKeyboardShortcuts(e) {
        // Ctrl+K - Command palette
        if (e.ctrlKey && e.key === 'k') {
            e.preventDefault();
            UI.toggleCommandPalette();
            return;
        }

        // Ctrl+N - New chat
        if (e.ctrlKey && e.key === 'n') {
            e.preventDefault();
            newChat();
            return;
        }

        // Ctrl+T - Toggle theme
        if (e.ctrlKey && e.key === 't') {
            e.preventDefault();
            UI.toggleTheme();
            return;
        }

        // Escape - Close modals
        if (e.key === 'Escape') {
            UI.hideCommandPalette();
            UI.hideSettings();
            UI.closeSidebar();
            return;
        }

        // / - Focus input (si pas déjà focus)
        if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
            e.preventDefault();
            UI.focusInput();
            return;
        }
    }

    // ============================================
    // API Publique
    // ============================================

    return {
        init,
        newChat,
        sendMessage,
        loadConversation,
        executeCommand
    };
})();

// ============================================
// Bootstrap
// ============================================

document.addEventListener('DOMContentLoaded', App.init);
