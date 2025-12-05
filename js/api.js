/**
 * RemYA - API Module
 * Communication avec Ollama et le backend RemYA
 */

const API = (function() {
    let abortController = null;

    // ============================================
    // Configuration
    // ============================================

    function getConfig() {
        const settings = Storage.getSettings();
        // Détection auto : en production, utiliser les chemins relatifs (proxy Nginx)
        const isProduction = window.location.hostname !== 'localhost' && !window.location.hostname.includes('127.0.0.1');
        const defaultOllamaUrl = isProduction ? '/ollama' : 'http://localhost:11434';
        const defaultBackendUrl = isProduction ? '' : 'http://localhost:3456';

        return {
            ollamaUrl: settings.ollamaUrl || defaultOllamaUrl,
            backendUrl: settings.backendUrl || defaultBackendUrl,
            model: settings.model || 'qwen2.5:7b'
        };
    }

    // ============================================
    // Ollama API
    // ============================================

    async function chat(messages, onChunk, options = {}) {
        const config = getConfig();
        const model = options.model || config.model;

        // Annuler la requête précédente si elle existe
        if (abortController) {
            abortController.abort();
        }
        abortController = new AbortController();

        try {
            const response = await fetch(`${config.ollamaUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: model,
                    messages: messages,
                    stream: true
                }),
                signal: abortController.signal
            });

            if (!response.ok) {
                throw new Error(`Erreur HTTP: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullResponse = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(line => line.trim());

                for (const line of lines) {
                    try {
                        const json = JSON.parse(line);
                        if (json.message?.content) {
                            fullResponse += json.message.content;
                            if (onChunk) {
                                onChunk(fullResponse, json.message.content);
                            }
                        }
                        if (json.done) {
                            return {
                                success: true,
                                content: fullResponse,
                                model: json.model,
                                totalDuration: json.total_duration,
                                evalCount: json.eval_count
                            };
                        }
                    } catch (e) {
                        // Ignorer les lignes JSON malformées
                    }
                }
            }

            return {
                success: true,
                content: fullResponse
            };

        } catch (error) {
            if (error.name === 'AbortError') {
                return { success: false, error: 'Requête annulée', aborted: true };
            }
            console.error('Erreur chat Ollama:', error);
            return {
                success: false,
                error: error.message || 'Impossible de contacter Ollama'
            };
        }
    }

    function cancelChat() {
        if (abortController) {
            abortController.abort();
            abortController = null;
        }
    }

    async function getModels() {
        const config = getConfig();
        try {
            const response = await fetch(`${config.ollamaUrl}/api/tags`);
            if (!response.ok) throw new Error('Erreur récupération modèles');
            const data = await response.json();
            return {
                success: true,
                models: data.models || []
            };
        } catch (error) {
            console.error('Erreur getModels:', error);
            return { success: false, error: error.message, models: [] };
        }
    }

    async function checkOllamaConnection() {
        const config = getConfig();
        try {
            const response = await fetch(`${config.ollamaUrl}/api/tags`, {
                method: 'GET',
                signal: AbortSignal.timeout(3000)
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    // ============================================
    // Backend RemYA API
    // ============================================

    async function backendRequest(endpoint, options = {}) {
        const config = getConfig();
        try {
            const response = await fetch(`${config.backendUrl}${endpoint}`, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.message || `Erreur HTTP: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`Erreur backend ${endpoint}:`, error);
            throw error;
        }
    }

    async function checkBackendConnection() {
        const config = getConfig();
        try {
            const response = await fetch(`${config.backendUrl}/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(3000)
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    // ============================================
    // File System API (via backend)
    // ============================================

    async function listFiles(path = '.') {
        return backendRequest('/api/files/list', {
            method: 'POST',
            body: JSON.stringify({ path })
        });
    }

    async function readFile(path) {
        return backendRequest('/api/files/read', {
            method: 'POST',
            body: JSON.stringify({ path })
        });
    }

    async function writeFile(path, content) {
        return backendRequest('/api/files/write', {
            method: 'POST',
            body: JSON.stringify({ path, content })
        });
    }

    async function createFolder(path) {
        return backendRequest('/api/files/mkdir', {
            method: 'POST',
            body: JSON.stringify({ path })
        });
    }

    async function deleteFile(path) {
        return backendRequest('/api/files/delete', {
            method: 'POST',
            body: JSON.stringify({ path })
        });
    }

    async function searchFiles(query, path = '.') {
        return backendRequest('/api/files/search', {
            method: 'POST',
            body: JSON.stringify({ query, path })
        });
    }

    // ============================================
    // System API (via backend)
    // ============================================

    async function executeCommand(command, safe = true) {
        return backendRequest('/api/system/exec', {
            method: 'POST',
            body: JSON.stringify({ command, safe })
        });
    }

    async function getSystemInfo() {
        return backendRequest('/api/system/info');
    }

    async function openApp(appName) {
        return backendRequest('/api/system/open', {
            method: 'POST',
            body: JSON.stringify({ app: appName })
        });
    }

    async function openUrl(url) {
        return backendRequest('/api/system/open-url', {
            method: 'POST',
            body: JSON.stringify({ url })
        });
    }

    async function getClipboard() {
        return backendRequest('/api/system/clipboard');
    }

    async function setClipboard(content) {
        return backendRequest('/api/system/clipboard', {
            method: 'POST',
            body: JSON.stringify({ content })
        });
    }

    // ============================================
    // Web Fetch API (via backend)
    // ============================================

    async function fetchWebPage(url) {
        return backendRequest('/api/web/fetch', {
            method: 'POST',
            body: JSON.stringify({ url })
        });
    }

    async function searchWeb(query) {
        return backendRequest('/api/web/search', {
            method: 'POST',
            body: JSON.stringify({ query })
        });
    }

    // ============================================
    // API Publique
    // ============================================

    return {
        // Ollama
        chat,
        cancelChat,
        getModels,
        checkOllamaConnection,

        // Backend
        checkBackendConnection,
        backendRequest,

        // Files
        listFiles,
        readFile,
        writeFile,
        createFolder,
        deleteFile,
        searchFiles,

        // System
        executeCommand,
        getSystemInfo,
        openApp,
        openUrl,
        getClipboard,
        setClipboard,

        // Web
        fetchWebPage,
        searchWeb
    };
})();
