/**
 * RemYA - Storage Module
 * Gestion de la persistance des données (localStorage / IndexedDB)
 */

const Storage = (function() {
    const KEYS = {
        CONVERSATIONS: 'remya_conversations',
        CURRENT_CONVERSATION: 'remya_current_conversation',
        SETTINGS: 'remya_settings',
        THEME: 'remya_theme'
    };

    const DEFAULT_SETTINGS = {
        // ollamaUrl et backendUrl sont gérés dynamiquement dans api.js
        userName: 'Rémy',
        model: 'qwen2.5:7b',
        enterToSend: true,
        enableSounds: false
    };

    // ============================================
    // Conversations
    // ============================================

    function getConversations() {
        try {
            const data = localStorage.getItem(KEYS.CONVERSATIONS);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error('Erreur lecture conversations:', e);
            return [];
        }
    }

    function saveConversations(conversations) {
        try {
            localStorage.setItem(KEYS.CONVERSATIONS, JSON.stringify(conversations));
        } catch (e) {
            console.error('Erreur sauvegarde conversations:', e);
        }
    }

    function getConversation(id) {
        const conversations = getConversations();
        return conversations.find(c => c.id === id) || null;
    }

    function createConversation(firstMessage = '') {
        const conversations = getConversations();
        const newConv = {
            id: generateId(),
            title: firstMessage.substring(0, 50) || 'Nouvelle conversation',
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        conversations.unshift(newConv);
        saveConversations(conversations);
        setCurrentConversationId(newConv.id);
        return newConv;
    }

    function updateConversation(id, updates) {
        const conversations = getConversations();
        const index = conversations.findIndex(c => c.id === id);
        if (index !== -1) {
            conversations[index] = {
                ...conversations[index],
                ...updates,
                updatedAt: Date.now()
            };
            // Trier par date de mise à jour
            conversations.sort((a, b) => b.updatedAt - a.updatedAt);
            saveConversations(conversations);
            return conversations[index];
        }
        return null;
    }

    function addMessageToConversation(conversationId, message) {
        const conversations = getConversations();
        const conv = conversations.find(c => c.id === conversationId);
        if (conv) {
            conv.messages.push({
                ...message,
                id: generateId(),
                timestamp: Date.now()
            });
            // Mettre à jour le titre si c'est le premier message utilisateur
            if (conv.messages.length === 1 && message.role === 'user') {
                conv.title = message.content.substring(0, 50);
                if (message.content.length > 50) conv.title += '...';
            }
            conv.updatedAt = Date.now();
            conversations.sort((a, b) => b.updatedAt - a.updatedAt);
            saveConversations(conversations);
            return conv;
        }
        return null;
    }

    function deleteConversation(id) {
        let conversations = getConversations();
        conversations = conversations.filter(c => c.id !== id);
        saveConversations(conversations);

        // Si c'était la conversation courante, reset
        if (getCurrentConversationId() === id) {
            setCurrentConversationId(null);
        }
    }

    function clearAllConversations() {
        saveConversations([]);
        setCurrentConversationId(null);
    }

    // ============================================
    // Conversation courante
    // ============================================

    function getCurrentConversationId() {
        return localStorage.getItem(KEYS.CURRENT_CONVERSATION);
    }

    function setCurrentConversationId(id) {
        if (id) {
            localStorage.setItem(KEYS.CURRENT_CONVERSATION, id);
        } else {
            localStorage.removeItem(KEYS.CURRENT_CONVERSATION);
        }
    }

    function getCurrentConversation() {
        const id = getCurrentConversationId();
        return id ? getConversation(id) : null;
    }

    // ============================================
    // Settings
    // ============================================

    function getSettings() {
        try {
            const data = localStorage.getItem(KEYS.SETTINGS);
            return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : { ...DEFAULT_SETTINGS };
        } catch (e) {
            console.error('Erreur lecture settings:', e);
            return { ...DEFAULT_SETTINGS };
        }
    }

    function saveSettings(settings) {
        try {
            localStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
        } catch (e) {
            console.error('Erreur sauvegarde settings:', e);
        }
    }

    function updateSettings(updates) {
        const settings = getSettings();
        const newSettings = { ...settings, ...updates };
        saveSettings(newSettings);
        return newSettings;
    }

    // ============================================
    // Theme
    // ============================================

    function getTheme() {
        return localStorage.getItem(KEYS.THEME) || 'dark';
    }

    function setTheme(theme) {
        localStorage.setItem(KEYS.THEME, theme);
        document.documentElement.setAttribute('data-theme', theme);
    }

    function toggleTheme() {
        const current = getTheme();
        const newTheme = current === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
        return newTheme;
    }

    // ============================================
    // Utilitaires
    // ============================================

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }

    function clearAllData() {
        Object.values(KEYS).forEach(key => {
            localStorage.removeItem(key);
        });
    }

    function exportData() {
        return {
            conversations: getConversations(),
            settings: getSettings(),
            theme: getTheme(),
            exportedAt: Date.now()
        };
    }

    function importData(data) {
        if (data.conversations) {
            saveConversations(data.conversations);
        }
        if (data.settings) {
            saveSettings(data.settings);
        }
        if (data.theme) {
            setTheme(data.theme);
        }
    }

    // ============================================
    // Recherche
    // ============================================

    function searchConversations(query) {
        if (!query || query.trim() === '') {
            return getConversations();
        }

        const normalizedQuery = query.toLowerCase().trim();
        const conversations = getConversations();

        return conversations.filter(conv => {
            // Recherche dans le titre
            if (conv.title.toLowerCase().includes(normalizedQuery)) {
                return true;
            }
            // Recherche dans les messages
            return conv.messages.some(msg =>
                msg.content.toLowerCase().includes(normalizedQuery)
            );
        });
    }

    // ============================================
    // API Publique
    // ============================================

    return {
        // Conversations
        getConversations,
        getConversation,
        createConversation,
        updateConversation,
        addMessageToConversation,
        deleteConversation,
        clearAllConversations,
        searchConversations,

        // Conversation courante
        getCurrentConversationId,
        setCurrentConversationId,
        getCurrentConversation,

        // Settings
        getSettings,
        saveSettings,
        updateSettings,

        // Theme
        getTheme,
        setTheme,
        toggleTheme,

        // Utilitaires
        generateId,
        clearAllData,
        exportData,
        importData
    };
})();
