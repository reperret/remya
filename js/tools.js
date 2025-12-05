/**
 * RemYA - Tools Module
 * Détection d'intentions et exécution d'actions système
 * Ce module permet au LLM d'interagir avec le PC
 */

const Tools = (function() {

    // ============================================
    // Patterns de détection d'intentions
    // ============================================

    const INTENTS = [
        {
            id: 'list_files',
            patterns: [
                // "liste moi les fichiers de mon bureau", "montre les fichiers du bureau"
                /(?:liste|affiche|montre|voir|donne)[\s-]*(?:moi)?\s+(?:les\s+)?fichiers?\s+(?:de\s+|du\s+|dans\s+|sur\s+)?(?:mon\s+|ma\s+|le\s+|la\s+)?(.+)/i,
                // "qu'est-ce qu'il y a dans mon bureau", "c'est quoi sur le bureau"
                /(?:qu['']?(?:est-ce\s+qu[''])?il\s+y\s+a|c['']?est\s+quoi)\s+(?:dans|sur)\s+(?:mon\s+|le\s+|la\s+)?(.+)/i,
                // "contenu de mon bureau", "contenu du dossier Documents"
                /(?:contenu|contenus?)\s+(?:de\s+|du\s+)?(?:mon\s+|le\s+)?(.+)/i,
                // "ouvre le bureau et liste", "affiche le dossier Documents et montre"
                /(?:ouvre|affiche)\s+(?:le\s+)?(?:dossier\s+)?(.+)\s+et\s+(?:liste|montre)/i,
                // "quels fichiers y a-t-il sur mon bureau", "quels sont les fichiers"
                /quels?\s+(?:sont\s+les\s+)?fichiers?\s+(?:y\s+a[- ]t[- ]il\s+)?(?:de\s+|du\s+|dans\s+|sur\s+)?(?:mon\s+|le\s+)?(.+)/i
            ],
            extract: (match) => {
                let path = match[1]?.trim();
                path = normalizePath(path);
                return { path };
            },
            execute: async (params) => {
                try {
                    const result = await API.listFiles(params.path);
                    if (result.success) {
                        return formatFileList(result);
                    }
                    return { error: result.error || 'Impossible de lister les fichiers' };
                } catch (e) {
                    return { error: e.message };
                }
            }
        },
        {
            id: 'open_folder',
            patterns: [
                // "ouvre moi le dossier Documents", "ouvre mon bureau"
                /(?:ouvre|ouvrir|affiche|afficher|va\s+(?:dans|sur))[\s-]*(?:moi)?\s+(?:le\s+)?(?:dossier\s+)?(?:mon\s+|ma\s+)?(.+)/i,
                // "accède à mon bureau", "accéder au dossier Documents"
                /(?:accède|accéder)[\s-]*(?:moi)?\s+(?:à|au|aux)\s+(?:mon\s+|le\s+)?(.+)/i
            ],
            extract: (match) => {
                let path = match[1]?.trim();
                // Nettoyer les mots parasites à la fin
                path = path.replace(/\s+(s'il\s+te\s+pla[iî]t|please|stp|svp)$/i, '');
                path = normalizePath(path);
                return { path };
            },
            execute: async (params) => {
                try {
                    const result = await API.backendRequest('/api/system/open-folder', {
                        method: 'POST',
                        body: JSON.stringify({ path: params.path })
                    });
                    if (result.success) {
                        return { message: `J'ai ouvert le dossier "${result.path}" dans l'explorateur.` };
                    }
                    return { error: result.error };
                } catch (e) {
                    return { error: e.message };
                }
            }
        },
        {
            id: 'open_app',
            patterns: [
                /(?:ouvre|lance|démarre?|exécute|run)\s+(?:l['']?(?:application|appli|app)\s+)?(.+)/i,
                /(?:peux-tu\s+)?(?:ouvrir|lancer)\s+(.+)/i
            ],
            exclude: [/dossier/, /fichier/, /bureau/, /documents?/, /téléchargements?/],
            extract: (match) => {
                let app = match[1]?.trim();
                app = app.replace(/\s+(s'il\s+te\s+pla[iî]t|please|stp|svp)$/i, '');
                return { app };
            },
            execute: async (params) => {
                try {
                    const result = await API.openApp(params.app);
                    if (result.success) {
                        return { message: `J'ai lancé "${params.app}".` };
                    }
                    return { error: result.error };
                } catch (e) {
                    return { error: e.message };
                }
            }
        },
        {
            id: 'system_info',
            patterns: [
                /(?:info(?:rmation)?s?\s+)?(?:système|system|pc|ordinateur|ordi)/i,
                /(?:c['']?est\s+quoi|quel(?:le)?s?\s+(?:est|sont))\s+(?:mon|ma|mes)\s+(?:config|configuration|specs?|caractéristiques?)/i,
                /(?:cpu|ram|mémoire|processeur|disque)/i,
                /(?:combien\s+(?:de|d[''])\s*(?:ram|mémoire|espace))/i
            ],
            extract: () => ({}),
            execute: async () => {
                try {
                    const result = await API.getSystemInfo();
                    if (result.success !== false) {
                        return formatSystemInfo(result);
                    }
                    return { error: 'Impossible de récupérer les infos système' };
                } catch (e) {
                    return { error: e.message };
                }
            }
        },
        {
            id: 'read_file',
            patterns: [
                /(?:lis|lire|affiche|montre|ouvre)\s+(?:le\s+)?(?:fichier\s+)?(?:le\s+contenu\s+(?:de|du)\s+)?(.+\.[\w]+)/i,
                /(?:qu['']?(?:est-ce qu[''])?il\s+y\s+a|c['']?est\s+quoi)\s+(?:dans|sur)\s+(?:le\s+fichier\s+)?(.+\.[\w]+)/i
            ],
            extract: (match) => {
                let path = match[1]?.trim();
                return { path };
            },
            execute: async (params) => {
                try {
                    const result = await API.readFile(params.path);
                    if (result.success) {
                        return formatFileContent(result);
                    }
                    return { error: result.error };
                } catch (e) {
                    return { error: e.message };
                }
            }
        },
        {
            id: 'search_files',
            patterns: [
                /(?:cherche|recherche|trouve|trouver)\s+(?:les?\s+)?(?:fichiers?\s+)?(?:nommé[es]?\s+)?["']?(.+?)["']?\s+(?:dans|sur)\s+(.+)/i,
                /(?:où\s+(?:est|sont)|trouve)\s+(?:les?\s+)?(?:fichiers?\s+)?(.+)/i
            ],
            extract: (match) => {
                const query = match[1]?.trim();
                const path = match[2] ? normalizePath(match[2].trim()) : null;
                return { query, path };
            },
            execute: async (params) => {
                try {
                    const result = await API.searchFiles(params.query, params.path || '.');
                    if (result.success) {
                        return formatSearchResults(result);
                    }
                    return { error: result.error };
                } catch (e) {
                    return { error: e.message };
                }
            }
        },
        {
            id: 'clipboard_read',
            patterns: [
                /(?:qu['']?(?:est-ce qu[''])?il\s+y\s+a|c['']?est\s+quoi|lis|montre|affiche)\s+(?:dans\s+)?(?:le\s+|mon\s+)?(?:presse[- ]?papier|clipboard)/i,
                /(?:contenu\s+(?:de|du)\s+)?(?:mon\s+)?(?:presse[- ]?papier|clipboard)/i
            ],
            extract: () => ({}),
            execute: async () => {
                try {
                    const result = await API.getClipboard();
                    if (result.success) {
                        return {
                            message: `Contenu du presse-papier :\n\`\`\`\n${result.content || '(vide)'}\n\`\`\``
                        };
                    }
                    return { error: result.error };
                } catch (e) {
                    return { error: e.message };
                }
            }
        },
        {
            id: 'clipboard_write',
            patterns: [
                /(?:copie|met|ajoute)\s+["'](.+)["']\s+(?:dans\s+)?(?:le\s+|mon\s+)?(?:presse[- ]?papier|clipboard)/i,
                /(?:presse[- ]?papier|clipboard)\s*[=:]\s*["']?(.+)["']?/i
            ],
            extract: (match) => ({ content: match[1]?.trim() }),
            execute: async (params) => {
                try {
                    const result = await API.setClipboard(params.content);
                    if (result.success) {
                        return { message: `J'ai copié "${params.content}" dans le presse-papier.` };
                    }
                    return { error: result.error };
                } catch (e) {
                    return { error: e.message };
                }
            }
        },
        {
            id: 'open_url',
            patterns: [
                /(?:ouvre|va\s+sur|affiche)\s+(?:le\s+site\s+)?(?:la\s+page\s+)?(https?:\/\/[^\s]+)/i,
                /(?:ouvre|va\s+sur|affiche)\s+(?:le\s+site\s+)?(?:la\s+page\s+)?([a-z0-9][-a-z0-9]*(?:\.[a-z]{2,})+)/i
            ],
            extract: (match) => {
                let url = match[1]?.trim();
                if (!url.startsWith('http')) {
                    url = 'https://' + url;
                }
                return { url };
            },
            execute: async (params) => {
                try {
                    const result = await API.openUrl(params.url);
                    if (result.success) {
                        return { message: `J'ai ouvert ${params.url} dans ton navigateur.` };
                    }
                    return { error: result.error };
                } catch (e) {
                    return { error: e.message };
                }
            }
        },
        {
            id: 'disk_space',
            patterns: [
                /(?:espace\s+)?(?:disque|stockage)/i,
                /(?:combien\s+(?:de|d[''])\s*)?(?:place|espace)\s+(?:libre|disponible|restant)/i,
                /(?:capacité|taille)\s+(?:du\s+)?(?:disque|ssd|hdd)/i
            ],
            extract: () => ({}),
            execute: async () => {
                try {
                    const result = await API.backendRequest('/api/system/disk');
                    if (result.success) {
                        return formatDiskInfo(result);
                    }
                    return { error: 'Impossible de récupérer les infos disque' };
                } catch (e) {
                    return { error: e.message };
                }
            }
        },
        {
            id: 'exec_command',
            patterns: [
                /(?:exécute|execute|run|lance)\s+(?:la\s+)?(?:commande\s+)?[`"'](.+)[`"']/i,
                /(?:tape|taper)\s+(?:dans\s+le\s+terminal\s+)?[`"'](.+)[`"']/i
            ],
            extract: (match) => ({ command: match[1]?.trim() }),
            execute: async (params) => {
                try {
                    const result = await API.executeCommand(params.command, true);
                    if (result.success) {
                        return {
                            message: `Commande exécutée : \`${params.command}\`\n\n\`\`\`\n${result.stdout || '(pas de sortie)'}\n\`\`\`${result.stderr ? '\n\nErreurs:\n```\n' + result.stderr + '\n```' : ''}`
                        };
                    }
                    return { error: result.error || result.stderr };
                } catch (e) {
                    return { error: e.message };
                }
            }
        }
    ];

    // ============================================
    // Normalisation des chemins
    // ============================================

    function normalizePath(inputPath) {
        if (!inputPath) return null;

        // Nettoyer le chemin
        let cleaned = inputPath.trim();

        // Supprimer les préfixes "mon/ma/le/la/les/mes"
        cleaned = cleaned.replace(/^(mon|ma|le|la|les|mes)\s+/i, '');

        // Normaliser les dossiers spéciaux (le backend fera la résolution)
        const specialFolders = [
            'bureau', 'desktop',
            'documents',
            'téléchargements', 'telechargements', 'downloads',
            'images', 'pictures', 'photos',
            'musique', 'music',
            'vidéos', 'videos'
        ];

        const lower = cleaned.toLowerCase();
        if (specialFolders.includes(lower)) {
            // Retourner juste le mot-clé, le backend résoudra
            return lower;
        }

        // Si c'est déjà un chemin absolu, le garder tel quel
        if (cleaned.match(/^[a-z]:\\/i) || cleaned.startsWith('/') || cleaned.startsWith('~')) {
            return cleaned;
        }

        // Sinon retourner tel quel (le backend résoudra)
        return cleaned;
    }

    // ============================================
    // Formatage des résultats
    // ============================================

    function formatFileList(result) {
        let message = `**Contenu de ${result.path}** (${result.count} éléments)\n\n`;

        if (result.items.length === 0) {
            message += '_Le dossier est vide._';
            return { message, data: result };
        }

        const folders = result.items.filter(i => i.type === 'directory');
        const files = result.items.filter(i => i.type === 'file');

        if (folders.length > 0) {
            message += '**Dossiers:**\n';
            folders.forEach(f => {
                message += `- 📁 ${f.name}\n`;
            });
            message += '\n';
        }

        if (files.length > 0) {
            message += '**Fichiers:**\n';
            files.slice(0, 20).forEach(f => {
                const icon = getFileIcon(f.extension);
                message += `- ${icon} ${f.name} (${f.sizeFormatted})\n`;
            });
            if (files.length > 20) {
                message += `\n_... et ${files.length - 20} autres fichiers_\n`;
            }
        }

        return { message, data: result };
    }

    function formatSystemInfo(result) {
        const { system, cpu, memory, user } = result;

        let message = `**Informations système**\n\n`;
        message += `**OS:** ${system.type} ${system.release} (${system.arch})\n`;
        message += `**Hostname:** ${system.hostname}\n`;
        message += `**Uptime:** ${system.uptime}\n\n`;
        message += `**Utilisateur:** ${user.username}\n`;
        message += `**Dossier home:** ${user.homedir}\n\n`;
        message += `**CPU:** ${cpu.model}\n`;
        message += `**Coeurs:** ${cpu.cores}\n\n`;
        message += `**RAM totale:** ${memory.totalFormatted}\n`;
        message += `**RAM utilisée:** ${memory.usedFormatted} (${memory.usagePercent}%)\n`;
        message += `**RAM libre:** ${memory.freeFormatted}\n`;

        return { message, data: result };
    }

    function formatFileContent(result) {
        let message = `**Fichier: ${result.name}** (${result.sizeFormatted})\n\n`;

        if (!result.isText) {
            message += '_Ce fichier est binaire et ne peut pas être affiché en texte._';
            return { message, data: result };
        }

        const ext = result.extension?.replace('.', '') || 'txt';
        const content = result.content.length > 3000
            ? result.content.substring(0, 3000) + '\n\n... (contenu tronqué)'
            : result.content;

        message += `\`\`\`${ext}\n${content}\n\`\`\``;

        return { message, data: result };
    }

    function formatSearchResults(result) {
        let message = `**Recherche: "${result.query}"** (${result.count} résultats)\n\n`;

        if (result.results.length === 0) {
            message += '_Aucun fichier trouvé._';
            return { message, data: result };
        }

        result.results.slice(0, 15).forEach(item => {
            const icon = item.type === 'directory' ? '📁' : getFileIcon(item.extension);
            message += `- ${icon} **${item.name}**\n  ${item.path}\n`;
        });

        if (result.results.length > 15) {
            message += `\n_... et ${result.results.length - 15} autres résultats_`;
        }

        return { message, data: result };
    }

    function formatDiskInfo(result) {
        let message = `**Espace disque**\n\n`;

        result.disks.forEach(disk => {
            const bar = createProgressBar(disk.usagePercent);
            message += `**${disk.mount}** ${bar} ${disk.usagePercent}%\n`;
            message += `  Utilisé: ${disk.used} / Total: ${disk.size} / Libre: ${disk.free}\n\n`;
        });

        return { message, data: result };
    }

    function getFileIcon(extension) {
        const icons = {
            '.pdf': '📕',
            '.doc': '📘', '.docx': '📘',
            '.xls': '📗', '.xlsx': '📗',
            '.ppt': '📙', '.pptx': '📙',
            '.txt': '📄', '.md': '📄',
            '.js': '🟨', '.ts': '🔷', '.jsx': '⚛️', '.tsx': '⚛️',
            '.py': '🐍',
            '.html': '🌐', '.css': '🎨',
            '.json': '📋',
            '.jpg': '🖼️', '.jpeg': '🖼️', '.png': '🖼️', '.gif': '🖼️', '.svg': '🖼️',
            '.mp3': '🎵', '.wav': '🎵', '.flac': '🎵',
            '.mp4': '🎬', '.mkv': '🎬', '.avi': '🎬',
            '.zip': '📦', '.rar': '📦', '.7z': '📦',
            '.exe': '⚙️', '.msi': '⚙️'
        };
        return icons[extension?.toLowerCase()] || '📄';
    }

    function createProgressBar(percent, length = 10) {
        const filled = Math.round((percent / 100) * length);
        const empty = length - filled;
        return '█'.repeat(filled) + '░'.repeat(empty);
    }

    // ============================================
    // Détection et exécution
    // ============================================

    async function detectAndExecute(message) {
        const lowerMessage = message.toLowerCase();

        for (const intent of INTENTS) {
            // Vérifier les exclusions
            if (intent.exclude) {
                const excluded = intent.exclude.some(pattern => pattern.test(message));
                if (excluded) continue;
            }

            // Tester chaque pattern
            for (const pattern of intent.patterns) {
                const match = message.match(pattern);
                if (match) {
                    console.log(`[Tools] Intent détecté: ${intent.id}`, match);

                    const params = intent.extract(match);
                    const result = await intent.execute(params);

                    return {
                        detected: true,
                        intent: intent.id,
                        params,
                        result
                    };
                }
            }
        }

        return { detected: false };
    }

    function buildSystemPrompt() {
        return `Tu es RemYA, un assistant IA personnel intelligent et amical.
Tu peux interagir avec le PC de l'utilisateur grâce à des outils système.

Quand l'utilisateur te demande une action système (lister fichiers, ouvrir dossier, etc.),
le système exécute automatiquement l'action et t'envoie le résultat.
Tu dois alors reformuler ce résultat de façon naturelle et utile.

Règles importantes:
- Sois concis et utile
- Si une action système a été exécutée, explique ce qui a été fait
- Si une erreur s'est produite, explique-la simplement et propose des solutions
- Tu peux faire des suggestions pertinentes basées sur le contexte
- Réponds toujours en français`;
    }

    // ============================================
    // API Publique
    // ============================================

    return {
        detectAndExecute,
        buildSystemPrompt,
        normalizePath
    };
})();
