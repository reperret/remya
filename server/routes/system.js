/**
 * RemYA - System Routes
 * Gestion des commandes système et informations PC
 */

const express = require('express');
const router = express.Router();
const { exec, spawn } = require('child_process');
const os = require('os');
const path = require('path');

// ============================================
// Configuration
// ============================================

// Commandes autorisées en mode safe
const SAFE_COMMANDS = [
    'dir', 'ls', 'cd', 'pwd', 'echo', 'type', 'cat', 'find', 'where', 'which',
    'date', 'time', 'whoami', 'hostname', 'ipconfig', 'ifconfig',
    'tasklist', 'ps', 'systeminfo', 'ver', 'uname',
    'node', 'npm', 'python', 'pip', 'git'
];

// Commandes dangereuses (toujours bloquées)
const BLOCKED_COMMANDS = [
    'rm -rf /', 'del /s /q c:\\', 'format', 'fdisk',
    'shutdown', 'restart', 'reboot', 'halt',
    ':(){:|:&};:', // Fork bomb
    'dd if=/dev/zero',
    'mkfs', 'wipefs'
];

// Applications courantes (Windows)
const APPS = {
    'notepad': 'notepad.exe',
    'calc': 'calc.exe',
    'calculatrice': 'calc.exe',
    'explorer': 'explorer.exe',
    'cmd': 'cmd.exe',
    'terminal': 'wt.exe',
    'powershell': 'powershell.exe',
    'chrome': 'start chrome',
    'firefox': 'start firefox',
    'edge': 'start msedge',
    'vscode': 'code',
    'code': 'code',
    'spotify': 'start spotify:',
    'discord': 'start discord:',
    'slack': 'start slack:'
};

// ============================================
// Helpers
// ============================================

function isCommandSafe(command) {
    const lowerCmd = command.toLowerCase().trim();

    // Vérifier les commandes bloquées
    for (const blocked of BLOCKED_COMMANDS) {
        if (lowerCmd.includes(blocked.toLowerCase())) {
            return false;
        }
    }

    // Extraire la commande de base
    const baseCmd = lowerCmd.split(/[\s&|;]/)[0];

    // Vérifier si c'est une commande safe
    return SAFE_COMMANDS.some(safe =>
        baseCmd === safe.toLowerCase() ||
        baseCmd.endsWith('\\' + safe.toLowerCase()) ||
        baseCmd.endsWith('/' + safe.toLowerCase())
    );
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    const parts = [];
    if (days > 0) parts.push(`${days}j`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);

    return parts.join(' ') || '< 1m';
}

// ============================================
// Routes
// ============================================

/**
 * Informations système
 */
router.get('/info', (req, res) => {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    res.json({
        success: true,
        system: {
            platform: os.platform(),
            type: os.type(),
            release: os.release(),
            arch: os.arch(),
            hostname: os.hostname(),
            uptime: formatUptime(os.uptime()),
            uptimeSeconds: os.uptime()
        },
        user: {
            username: os.userInfo().username,
            homedir: os.homedir(),
            shell: os.userInfo().shell
        },
        cpu: {
            model: cpus[0]?.model || 'Unknown',
            cores: cpus.length,
            speed: cpus[0]?.speed || 0
        },
        memory: {
            total: totalMem,
            totalFormatted: formatBytes(totalMem),
            used: usedMem,
            usedFormatted: formatBytes(usedMem),
            free: freeMem,
            freeFormatted: formatBytes(freeMem),
            usagePercent: Math.round((usedMem / totalMem) * 100)
        },
        network: Object.entries(os.networkInterfaces())
            .filter(([name]) => !name.includes('Loopback'))
            .map(([name, interfaces]) => ({
                name,
                addresses: interfaces
                    .filter(i => i.family === 'IPv4')
                    .map(i => i.address)
            })),
        env: {
            nodeVersion: process.version,
            platform: process.platform,
            pid: process.pid
        }
    });
});

/**
 * Exécuter une commande
 */
router.post('/exec', (req, res) => {
    const { command, safe = true, timeout = 30000, cwd } = req.body;

    if (!command) {
        return res.status(400).json({
            success: false,
            error: 'Commande requise'
        });
    }

    // Vérification de sécurité
    if (safe && !isCommandSafe(command)) {
        return res.status(403).json({
            success: false,
            error: 'Commande non autorisée en mode safe. Utilisez safe: false pour les commandes avancées (à vos risques).'
        });
    }

    const options = {
        timeout,
        maxBuffer: 1024 * 1024 * 10, // 10MB
        shell: true,
        encoding: 'utf8'
    };

    if (cwd) {
        options.cwd = cwd;
    }

    exec(command, options, (error, stdout, stderr) => {
        if (error && error.killed) {
            return res.json({
                success: false,
                error: 'Commande timeout',
                timeout: true
            });
        }

        res.json({
            success: !error,
            command,
            stdout: stdout || '',
            stderr: stderr || '',
            error: error ? error.message : null,
            exitCode: error ? error.code : 0
        });
    });
});

/**
 * Ouvrir une application
 */
router.post('/open', (req, res) => {
    const { app, args = [] } = req.body;

    if (!app) {
        return res.status(400).json({
            success: false,
            error: 'Application requise'
        });
    }

    const appLower = app.toLowerCase();
    let command = APPS[appLower] || app;

    // Ajouter les arguments
    if (args.length > 0) {
        command += ' ' + args.map(a => `"${a}"`).join(' ');
    }

    // Sur Windows, utiliser start pour les apps qui ne sont pas des commandes directes
    if (process.platform === 'win32' && !command.startsWith('start ')) {
        command = `start "" ${command}`;
    }

    exec(command, { shell: true }, (error, stdout, stderr) => {
        res.json({
            success: !error,
            app,
            command,
            error: error ? error.message : null
        });
    });
});

/**
 * Ouvrir une URL dans le navigateur par défaut
 */
router.post('/open-url', (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({
            success: false,
            error: 'URL requise'
        });
    }

    // Validation basique de l'URL
    try {
        new URL(url);
    } catch {
        return res.status(400).json({
            success: false,
            error: 'URL invalide'
        });
    }

    let command;
    switch (process.platform) {
        case 'win32':
            command = `start "" "${url}"`;
            break;
        case 'darwin':
            command = `open "${url}"`;
            break;
        default:
            command = `xdg-open "${url}"`;
    }

    exec(command, { shell: true }, (error) => {
        res.json({
            success: !error,
            url,
            error: error ? error.message : null
        });
    });
});

/**
 * Ouvrir un dossier dans l'explorateur
 */
router.post('/open-folder', (req, res) => {
    let { path: folderPath } = req.body;

    if (!folderPath) {
        folderPath = os.homedir();
    }

    // Résoudre les variables d'environnement Windows
    folderPath = folderPath
        .replace(/%USERPROFILE%/gi, os.homedir())
        .replace(/%HOME%/gi, os.homedir())
        .replace(/%DESKTOP%/gi, path.join(os.homedir(), 'Desktop'))
        .replace(/^~/, os.homedir());

    // Résoudre le chemin
    folderPath = path.resolve(folderPath);

    let command;
    switch (process.platform) {
        case 'win32':
            command = `explorer "${folderPath}"`;
            break;
        case 'darwin':
            command = `open "${folderPath}"`;
            break;
        default:
            command = `xdg-open "${folderPath}"`;
    }

    exec(command, { shell: true }, (error) => {
        res.json({
            success: !error,
            path: folderPath,
            error: error ? error.message : null
        });
    });
});

/**
 * Presse-papier - Lire
 */
router.get('/clipboard', (req, res) => {
    let command;
    switch (process.platform) {
        case 'win32':
            command = 'powershell -command "Get-Clipboard"';
            break;
        case 'darwin':
            command = 'pbpaste';
            break;
        default:
            command = 'xclip -selection clipboard -o';
    }

    exec(command, { encoding: 'utf8' }, (error, stdout) => {
        res.json({
            success: !error,
            content: stdout || '',
            error: error ? error.message : null
        });
    });
});

/**
 * Presse-papier - Écrire
 */
router.post('/clipboard', (req, res) => {
    const { content } = req.body;

    if (content === undefined) {
        return res.status(400).json({
            success: false,
            error: 'Contenu requis'
        });
    }

    let command;
    const escapedContent = content.replace(/"/g, '\\"');

    switch (process.platform) {
        case 'win32':
            command = `powershell -command "Set-Clipboard -Value '${content.replace(/'/g, "''")}'"`
            break;
        case 'darwin':
            command = `echo "${escapedContent}" | pbcopy`;
            break;
        default:
            command = `echo "${escapedContent}" | xclip -selection clipboard`;
    }

    exec(command, { shell: true }, (error) => {
        res.json({
            success: !error,
            error: error ? error.message : null
        });
    });
});

/**
 * Liste des processus
 */
router.get('/processes', (req, res) => {
    let command;
    switch (process.platform) {
        case 'win32':
            command = 'tasklist /FO CSV /NH';
            break;
        default:
            command = 'ps aux';
    }

    exec(command, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 5 }, (error, stdout) => {
        if (error) {
            return res.json({
                success: false,
                error: error.message
            });
        }

        let processes = [];

        if (process.platform === 'win32') {
            // Parse CSV Windows
            const lines = stdout.trim().split('\n');
            processes = lines.map(line => {
                const parts = line.match(/"([^"]*)"/g)?.map(p => p.replace(/"/g, '')) || [];
                return {
                    name: parts[0] || '',
                    pid: parseInt(parts[1]) || 0,
                    sessionName: parts[2] || '',
                    sessionNum: parts[3] || '',
                    memory: parts[4] || ''
                };
            }).filter(p => p.pid > 0);
        } else {
            // Parse Unix
            const lines = stdout.trim().split('\n').slice(1);
            processes = lines.map(line => {
                const parts = line.trim().split(/\s+/);
                return {
                    user: parts[0],
                    pid: parseInt(parts[1]),
                    cpu: parseFloat(parts[2]),
                    mem: parseFloat(parts[3]),
                    command: parts.slice(10).join(' ')
                };
            });
        }

        res.json({
            success: true,
            count: processes.length,
            processes
        });
    });
});

/**
 * Tuer un processus
 */
router.post('/kill', (req, res) => {
    const { pid, name } = req.body;

    if (!pid && !name) {
        return res.status(400).json({
            success: false,
            error: 'PID ou nom de processus requis'
        });
    }

    let command;
    if (process.platform === 'win32') {
        command = pid
            ? `taskkill /PID ${pid} /F`
            : `taskkill /IM "${name}" /F`;
    } else {
        command = pid
            ? `kill -9 ${pid}`
            : `pkill -9 "${name}"`;
    }

    exec(command, (error, stdout, stderr) => {
        res.json({
            success: !error,
            pid,
            name,
            error: error ? error.message : null
        });
    });
});

/**
 * Espace disque
 */
router.get('/disk', (req, res) => {
    let command;
    if (process.platform === 'win32') {
        command = 'wmic logicaldisk get size,freespace,caption';
    } else {
        command = 'df -h';
    }

    exec(command, { encoding: 'utf8' }, (error, stdout) => {
        if (error) {
            return res.json({
                success: false,
                error: error.message
            });
        }

        let disks = [];

        if (process.platform === 'win32') {
            const lines = stdout.trim().split('\n').slice(1);
            disks = lines.map(line => {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 3) {
                    const caption = parts[0];
                    const free = parseInt(parts[1]) || 0;
                    const size = parseInt(parts[2]) || 0;
                    return {
                        mount: caption,
                        size: formatBytes(size),
                        free: formatBytes(free),
                        used: formatBytes(size - free),
                        usagePercent: size > 0 ? Math.round(((size - free) / size) * 100) : 0
                    };
                }
                return null;
            }).filter(d => d !== null);
        } else {
            const lines = stdout.trim().split('\n').slice(1);
            disks = lines.map(line => {
                const parts = line.trim().split(/\s+/);
                return {
                    filesystem: parts[0],
                    size: parts[1],
                    used: parts[2],
                    free: parts[3],
                    usagePercent: parseInt(parts[4]) || 0,
                    mount: parts[5]
                };
            });
        }

        res.json({
            success: true,
            disks
        });
    });
});

module.exports = router;
