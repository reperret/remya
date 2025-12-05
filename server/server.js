/**
 * RemYA Backend Server
 * Gère les interactions système, fichiers et proxy Ollama
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

// Import des routes
const filesRoutes = require('./routes/files');
const systemRoutes = require('./routes/system');
const webRoutes = require('./routes/web');

const app = express();
const PORT = process.env.PORT || 3456;

// ============================================
// Middleware
// ============================================

app.use(cors({
    origin: '*', // En prod, restreindre à l'origine spécifique
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Logger simple
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.url}`);
    next();
});

// ============================================
// Routes
// ============================================

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        version: '1.0.0',
        timestamp: Date.now(),
        platform: process.platform,
        node: process.version
    });
});

// API Routes
app.use('/api/files', filesRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/web', webRoutes);

// ============================================
// Error Handling
// ============================================

app.use((err, req, res, next) => {
    console.error('Erreur serveur:', err);
    res.status(500).json({
        success: false,
        error: err.message || 'Erreur serveur interne'
    });
});

// 404 Handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route non trouvée'
    });
});

// ============================================
// Start Server
// ============================================

app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║   ⚡ RemYA Backend Server                             ║
║                                                       ║
║   Port: ${PORT}                                        ║
║   URL:  http://localhost:${PORT}                       ║
║                                                       ║
║   Routes disponibles:                                 ║
║   - GET  /health              Health check            ║
║   - POST /api/files/list      Lister fichiers         ║
║   - POST /api/files/read      Lire un fichier         ║
║   - POST /api/files/write     Écrire un fichier       ║
║   - POST /api/files/mkdir     Créer un dossier        ║
║   - POST /api/files/delete    Supprimer               ║
║   - POST /api/files/search    Rechercher              ║
║   - POST /api/system/exec     Exécuter commande       ║
║   - GET  /api/system/info     Info système            ║
║   - POST /api/system/open     Ouvrir application      ║
║   - POST /api/system/clipboard Presse-papier          ║
║   - POST /api/web/fetch       Fetch une page          ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
    `);
});

module.exports = app;
