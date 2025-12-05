/**
 * RemYA - Files Routes
 * Gestion des fichiers et dossiers
 */

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const os = require('os');

// ============================================
// Détection intelligente des dossiers utilisateur
// ============================================

function findDesktopPath() {
    const homedir = os.homedir();

    // Emplacements possibles pour le Bureau (dans l'ordre de priorité)
    const possiblePaths = [
        path.join(homedir, 'Desktop'),
        path.join(homedir, 'Bureau'),
    ];

    // Chercher dans les dossiers OneDrive
    try {
        const entries = fsSync.readdirSync(homedir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory() && entry.name.toLowerCase().startsWith('onedrive')) {
                const onedrivePath = path.join(homedir, entry.name);
                possiblePaths.push(path.join(onedrivePath, 'Desktop'));
                possiblePaths.push(path.join(onedrivePath, 'Bureau'));
            }
        }
    } catch (e) {
        // Ignore
    }

    // Retourner le premier chemin qui existe
    for (const p of possiblePaths) {
        if (fsSync.existsSync(p)) {
            console.log(`[Files] Bureau trouvé: ${p}`);
            return p;
        }
    }

    // Par défaut, retourner le home
    console.log(`[Files] Bureau non trouvé, utilisation du home: ${homedir}`);
    return homedir;
}

// Dossier de base par défaut (Bureau de l'utilisateur)
const DEFAULT_BASE = findDesktopPath();

// Dossiers autorisés (sécurité)
const ALLOWED_ROOTS = [
    os.homedir(),
    'C:\\',
    'D:\\'
];

// Extensions de fichiers texte
const TEXT_EXTENSIONS = [
    '.txt', '.md', '.json', '.js', '.ts', '.jsx', '.tsx',
    '.html', '.css', '.scss', '.less', '.xml', '.yaml', '.yml',
    '.py', '.rb', '.php', '.java', '.c', '.cpp', '.h', '.hpp',
    '.cs', '.go', '.rs', '.swift', '.kt', '.sql', '.sh', '.bat',
    '.env', '.gitignore', '.editorconfig', '.prettierrc',
    '.csv', '.log', '.ini', '.conf', '.config'
];

// ============================================
// Helpers
// ============================================

function findSpecialFolder(folderName) {
    const homedir = os.homedir();
    const possibleNames = [];

    // Mappings français/anglais
    const mappings = {
        'desktop': ['Desktop', 'Bureau'],
        'documents': ['Documents', 'Mes documents'],
        'downloads': ['Downloads', 'Téléchargements'],
        'pictures': ['Pictures', 'Images'],
        'music': ['Music', 'Musique'],
        'videos': ['Videos', 'Vidéos']
    };

    const key = folderName.toLowerCase();
    if (mappings[key]) {
        possibleNames.push(...mappings[key]);
    } else {
        possibleNames.push(folderName);
    }

    // D'abord chercher directement dans le home
    for (const name of possibleNames) {
        const directPath = path.join(homedir, name);
        if (fsSync.existsSync(directPath)) {
            return directPath;
        }
    }

    // Ensuite chercher dans les dossiers OneDrive
    try {
        const entries = fsSync.readdirSync(homedir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory() && entry.name.toLowerCase().startsWith('onedrive')) {
                const onedrivePath = path.join(homedir, entry.name);
                for (const name of possibleNames) {
                    const onedriveFolderPath = path.join(onedrivePath, name);
                    if (fsSync.existsSync(onedriveFolderPath)) {
                        return onedriveFolderPath;
                    }
                }
            }
        }
    } catch (e) {
        // Ignore
    }

    // Par défaut retourner le chemin direct dans le home
    return path.join(homedir, possibleNames[0]);
}

function resolvePath(inputPath) {
    if (!inputPath || inputPath === '.') {
        return DEFAULT_BASE;
    }

    // Mapping des mots-clés vers les dossiers spéciaux
    const specialFolders = {
        'bureau': 'desktop',
        'desktop': 'desktop',
        'documents': 'documents',
        'téléchargements': 'downloads',
        'telechargements': 'downloads',
        'downloads': 'downloads',
        'images': 'pictures',
        'pictures': 'pictures',
        'photos': 'pictures',
        'musique': 'music',
        'music': 'music',
        'vidéos': 'videos',
        'videos': 'videos'
    };

    // Nettoyer le chemin d'entrée
    let cleaned = inputPath.trim().toLowerCase();

    // Vérifier si c'est un dossier spécial
    for (const [keyword, folderType] of Object.entries(specialFolders)) {
        if (cleaned === keyword || cleaned === `%userprofile%\\${keyword}` || cleaned === `%userprofile%/${keyword}`) {
            return findSpecialFolder(folderType);
        }
    }

    // Remplacer les variables d'environnement
    let resolved = inputPath
        .replace(/^~/, os.homedir())
        .replace(/%USERPROFILE%/gi, os.homedir())
        .replace(/%DESKTOP%/gi, DEFAULT_BASE)
        .replace(/%HOME%/gi, os.homedir());

    // Résoudre le chemin final
    resolved = path.resolve(resolved);

    return resolved;
}

function isPathAllowed(targetPath) {
    const normalized = path.normalize(targetPath).toLowerCase();
    return ALLOWED_ROOTS.some(root =>
        normalized.startsWith(root.toLowerCase())
    );
}

function isTextFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return TEXT_EXTENSIONS.includes(ext);
}

function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ============================================
// Routes
// ============================================

/**
 * Lister les fichiers d'un dossier
 */
router.post('/list', async (req, res) => {
    try {
        const { path: inputPath, showHidden = false } = req.body;
        const targetPath = resolvePath(inputPath);

        if (!isPathAllowed(targetPath)) {
            return res.status(403).json({
                success: false,
                error: 'Accès refusé à ce chemin'
            });
        }

        const stats = await fs.stat(targetPath);
        if (!stats.isDirectory()) {
            return res.status(400).json({
                success: false,
                error: 'Le chemin spécifié n\'est pas un dossier'
            });
        }

        const entries = await fs.readdir(targetPath, { withFileTypes: true });
        const items = [];

        for (const entry of entries) {
            // Filtrer les fichiers cachés si demandé
            if (!showHidden && entry.name.startsWith('.')) {
                continue;
            }

            try {
                const fullPath = path.join(targetPath, entry.name);
                const itemStats = await fs.stat(fullPath);

                items.push({
                    name: entry.name,
                    path: fullPath,
                    type: entry.isDirectory() ? 'directory' : 'file',
                    size: entry.isDirectory() ? null : itemStats.size,
                    sizeFormatted: entry.isDirectory() ? '-' : formatSize(itemStats.size),
                    modified: itemStats.mtime,
                    created: itemStats.birthtime,
                    extension: entry.isDirectory() ? null : path.extname(entry.name).toLowerCase()
                });
            } catch (e) {
                // Ignorer les fichiers inaccessibles
            }
        }

        // Trier: dossiers d'abord, puis par nom
        items.sort((a, b) => {
            if (a.type !== b.type) {
                return a.type === 'directory' ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });

        res.json({
            success: true,
            path: targetPath,
            parent: path.dirname(targetPath),
            count: items.length,
            items
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Lire le contenu d'un fichier
 */
router.post('/read', async (req, res) => {
    try {
        const { path: inputPath, encoding = 'utf8' } = req.body;
        const targetPath = resolvePath(inputPath);

        if (!isPathAllowed(targetPath)) {
            return res.status(403).json({
                success: false,
                error: 'Accès refusé à ce chemin'
            });
        }

        const stats = await fs.stat(targetPath);
        if (stats.isDirectory()) {
            return res.status(400).json({
                success: false,
                error: 'Le chemin spécifié est un dossier, pas un fichier'
            });
        }

        // Limiter la taille des fichiers lisibles (5MB)
        if (stats.size > 5 * 1024 * 1024) {
            return res.status(400).json({
                success: false,
                error: 'Fichier trop volumineux (max 5MB)'
            });
        }

        let content;
        const isText = isTextFile(targetPath);

        if (isText) {
            content = await fs.readFile(targetPath, encoding);
        } else {
            // Pour les fichiers binaires, retourner en base64
            const buffer = await fs.readFile(targetPath);
            content = buffer.toString('base64');
        }

        res.json({
            success: true,
            path: targetPath,
            name: path.basename(targetPath),
            extension: path.extname(targetPath),
            size: stats.size,
            sizeFormatted: formatSize(stats.size),
            isText,
            encoding: isText ? encoding : 'base64',
            content,
            modified: stats.mtime
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Écrire dans un fichier
 */
router.post('/write', async (req, res) => {
    try {
        const { path: inputPath, content, encoding = 'utf8', createDirs = true } = req.body;
        const targetPath = resolvePath(inputPath);

        if (!isPathAllowed(targetPath)) {
            return res.status(403).json({
                success: false,
                error: 'Accès refusé à ce chemin'
            });
        }

        // Créer les dossiers parents si nécessaire
        if (createDirs) {
            const dir = path.dirname(targetPath);
            await fs.mkdir(dir, { recursive: true });
        }

        await fs.writeFile(targetPath, content, encoding);

        const stats = await fs.stat(targetPath);

        res.json({
            success: true,
            path: targetPath,
            name: path.basename(targetPath),
            size: stats.size,
            sizeFormatted: formatSize(stats.size)
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Créer un dossier
 */
router.post('/mkdir', async (req, res) => {
    try {
        const { path: inputPath } = req.body;
        const targetPath = resolvePath(inputPath);

        if (!isPathAllowed(targetPath)) {
            return res.status(403).json({
                success: false,
                error: 'Accès refusé à ce chemin'
            });
        }

        await fs.mkdir(targetPath, { recursive: true });

        res.json({
            success: true,
            path: targetPath,
            message: 'Dossier créé avec succès'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Supprimer un fichier ou dossier
 */
router.post('/delete', async (req, res) => {
    try {
        const { path: inputPath, recursive = false } = req.body;
        const targetPath = resolvePath(inputPath);

        if (!isPathAllowed(targetPath)) {
            return res.status(403).json({
                success: false,
                error: 'Accès refusé à ce chemin'
            });
        }

        // Protection: ne pas supprimer les dossiers racines
        const normalized = path.normalize(targetPath);
        if (ALLOWED_ROOTS.some(root => normalized.toLowerCase() === root.toLowerCase())) {
            return res.status(403).json({
                success: false,
                error: 'Impossible de supprimer un dossier racine'
            });
        }

        const stats = await fs.stat(targetPath);

        if (stats.isDirectory()) {
            if (recursive) {
                await fs.rm(targetPath, { recursive: true, force: true });
            } else {
                await fs.rmdir(targetPath);
            }
        } else {
            await fs.unlink(targetPath);
        }

        res.json({
            success: true,
            path: targetPath,
            message: 'Supprimé avec succès'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Rechercher des fichiers
 */
router.post('/search', async (req, res) => {
    try {
        const { query, path: inputPath, maxResults = 50 } = req.body;
        const targetPath = resolvePath(inputPath);

        if (!isPathAllowed(targetPath)) {
            return res.status(403).json({
                success: false,
                error: 'Accès refusé à ce chemin'
            });
        }

        const results = [];
        const searchQuery = query.toLowerCase();

        async function searchDir(dir, depth = 0) {
            if (depth > 5 || results.length >= maxResults) return;

            try {
                const entries = await fs.readdir(dir, { withFileTypes: true });

                for (const entry of entries) {
                    if (results.length >= maxResults) break;

                    // Ignorer les dossiers système
                    if (entry.name.startsWith('.') ||
                        entry.name === 'node_modules' ||
                        entry.name === '$Recycle.Bin') {
                        continue;
                    }

                    const fullPath = path.join(dir, entry.name);

                    if (entry.name.toLowerCase().includes(searchQuery)) {
                        try {
                            const stats = await fs.stat(fullPath);
                            results.push({
                                name: entry.name,
                                path: fullPath,
                                type: entry.isDirectory() ? 'directory' : 'file',
                                size: entry.isDirectory() ? null : stats.size,
                                sizeFormatted: entry.isDirectory() ? '-' : formatSize(stats.size),
                                modified: stats.mtime
                            });
                        } catch (e) {
                            // Ignorer les fichiers inaccessibles
                        }
                    }

                    if (entry.isDirectory()) {
                        await searchDir(fullPath, depth + 1);
                    }
                }
            } catch (e) {
                // Ignorer les dossiers inaccessibles
            }
        }

        await searchDir(targetPath);

        res.json({
            success: true,
            query,
            searchPath: targetPath,
            count: results.length,
            results
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Obtenir les infos d'un fichier/dossier
 */
router.post('/info', async (req, res) => {
    try {
        const { path: inputPath } = req.body;
        const targetPath = resolvePath(inputPath);

        if (!isPathAllowed(targetPath)) {
            return res.status(403).json({
                success: false,
                error: 'Accès refusé à ce chemin'
            });
        }

        const stats = await fs.stat(targetPath);

        res.json({
            success: true,
            path: targetPath,
            name: path.basename(targetPath),
            type: stats.isDirectory() ? 'directory' : 'file',
            size: stats.size,
            sizeFormatted: formatSize(stats.size),
            created: stats.birthtime,
            modified: stats.mtime,
            accessed: stats.atime,
            extension: stats.isDirectory() ? null : path.extname(targetPath),
            isText: stats.isDirectory() ? false : isTextFile(targetPath)
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
