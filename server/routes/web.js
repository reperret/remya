/**
 * RemYA - Web Routes
 * Fetch de pages web et extraction de contenu
 */

const express = require('express');
const router = express.Router();
const https = require('https');
const http = require('http');
const { URL } = require('url');

// ============================================
// Helpers
// ============================================

function fetchUrl(url, options = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;

        const requestOptions = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port,
            path: parsedUrl.pathname + parsedUrl.search,
            method: options.method || 'GET',
            headers: {
                'User-Agent': 'RemYA/1.0 (Assistant IA)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
                ...options.headers
            },
            timeout: options.timeout || 10000
        };

        const req = protocol.request(requestOptions, (res) => {
            // Gérer les redirections
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const redirectUrl = new URL(res.headers.location, url).toString();
                fetchUrl(redirectUrl, options).then(resolve).catch(reject);
                return;
            }

            let data = '';
            res.setEncoding('utf8');

            res.on('data', chunk => {
                data += chunk;
                // Limiter la taille
                if (data.length > 2 * 1024 * 1024) {
                    req.destroy();
                    reject(new Error('Contenu trop volumineux'));
                }
            });

            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: data
                });
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Timeout'));
        });

        req.end();
    });
}

function extractTextFromHtml(html) {
    // Supprimer les scripts et styles
    let text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');

    // Extraire le titre
    const titleMatch = text.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';

    // Extraire la meta description
    const descMatch = text.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i);
    const description = descMatch ? descMatch[1].trim() : '';

    // Convertir les balises de bloc en newlines
    text = text
        .replace(/<\/?(p|div|br|h[1-6]|li|tr|blockquote)[^>]*>/gi, '\n')
        .replace(/<\/?(ul|ol|table|thead|tbody)[^>]*>/gi, '\n')
        .replace(/<hr[^>]*>/gi, '\n---\n');

    // Préserver les liens
    text = text.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>([^<]*)<\/a>/gi, '$2 ($1)');

    // Supprimer toutes les autres balises HTML
    text = text.replace(/<[^>]+>/g, '');

    // Décoder les entités HTML courantes
    text = text
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&euro;/g, '€')
        .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(num));

    // Nettoyer les espaces
    text = text
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n/g, '\n\n')
        .trim();

    // Limiter la longueur
    if (text.length > 50000) {
        text = text.substring(0, 50000) + '\n\n[Contenu tronqué...]';
    }

    return { title, description, content: text };
}

function extractMetadata(html, url) {
    const metadata = {
        url,
        title: '',
        description: '',
        image: '',
        author: '',
        publishDate: '',
        siteName: ''
    };

    // Title
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    metadata.title = titleMatch ? titleMatch[1].trim() : '';

    // Meta tags
    const metas = html.matchAll(/<meta[^>]*>/gi);
    for (const meta of metas) {
        const tag = meta[0];

        // Name-based metas
        const nameMatch = tag.match(/name=["']([^"']*)["']/i);
        const contentMatch = tag.match(/content=["']([^"']*)["']/i);

        if (nameMatch && contentMatch) {
            const name = nameMatch[1].toLowerCase();
            const content = contentMatch[1];

            if (name === 'description') metadata.description = content;
            if (name === 'author') metadata.author = content;
        }

        // Property-based metas (Open Graph)
        const propMatch = tag.match(/property=["']([^"']*)["']/i);
        if (propMatch && contentMatch) {
            const prop = propMatch[1].toLowerCase();
            const content = contentMatch[1];

            if (prop === 'og:title' && !metadata.title) metadata.title = content;
            if (prop === 'og:description' && !metadata.description) metadata.description = content;
            if (prop === 'og:image') metadata.image = content;
            if (prop === 'og:site_name') metadata.siteName = content;
            if (prop === 'article:published_time') metadata.publishDate = content;
        }
    }

    return metadata;
}

// ============================================
// Routes
// ============================================

/**
 * Fetch une page web et extraire le contenu
 */
router.post('/fetch', async (req, res) => {
    try {
        const { url, extractText = true, timeout = 10000 } = req.body;

        if (!url) {
            return res.status(400).json({
                success: false,
                error: 'URL requise'
            });
        }

        // Validation de l'URL
        let parsedUrl;
        try {
            parsedUrl = new URL(url);
            if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
                throw new Error('Protocole non supporté');
            }
        } catch {
            return res.status(400).json({
                success: false,
                error: 'URL invalide'
            });
        }

        const response = await fetchUrl(url, { timeout });

        if (response.statusCode !== 200) {
            return res.json({
                success: false,
                error: `Erreur HTTP ${response.statusCode}`,
                statusCode: response.statusCode
            });
        }

        const contentType = response.headers['content-type'] || '';
        const isHtml = contentType.includes('text/html');

        let result = {
            success: true,
            url,
            statusCode: response.statusCode,
            contentType,
            contentLength: response.body.length
        };

        if (isHtml && extractText) {
            const extracted = extractTextFromHtml(response.body);
            const metadata = extractMetadata(response.body, url);

            result = {
                ...result,
                ...metadata,
                content: extracted.content
            };
        } else {
            result.content = response.body;
        }

        res.json(result);

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Extraire les liens d'une page
 */
router.post('/links', async (req, res) => {
    try {
        const { url, timeout = 10000 } = req.body;

        if (!url) {
            return res.status(400).json({
                success: false,
                error: 'URL requise'
            });
        }

        const response = await fetchUrl(url, { timeout });

        if (response.statusCode !== 200) {
            return res.json({
                success: false,
                error: `Erreur HTTP ${response.statusCode}`
            });
        }

        const baseUrl = new URL(url);
        const links = [];
        const linkRegex = /<a[^>]*href=["']([^"']*)["'][^>]*>([^<]*)<\/a>/gi;

        let match;
        while ((match = linkRegex.exec(response.body)) !== null) {
            const href = match[1];
            const text = match[2].trim();

            if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
                try {
                    const absoluteUrl = new URL(href, url).toString();
                    links.push({
                        url: absoluteUrl,
                        text: text || href,
                        internal: absoluteUrl.startsWith(baseUrl.origin)
                    });
                } catch {
                    // Ignorer les URLs invalides
                }
            }
        }

        // Dédupliquer
        const uniqueLinks = Array.from(
            new Map(links.map(l => [l.url, l])).values()
        );

        res.json({
            success: true,
            url,
            count: uniqueLinks.length,
            links: uniqueLinks
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Vérifier si une URL est accessible
 */
router.post('/check', async (req, res) => {
    try {
        const { url, timeout = 5000 } = req.body;

        if (!url) {
            return res.status(400).json({
                success: false,
                error: 'URL requise'
            });
        }

        const startTime = Date.now();

        try {
            const response = await fetchUrl(url, { timeout, method: 'HEAD' });
            const duration = Date.now() - startTime;

            res.json({
                success: true,
                url,
                accessible: response.statusCode < 400,
                statusCode: response.statusCode,
                responseTime: duration,
                headers: {
                    contentType: response.headers['content-type'],
                    server: response.headers['server'],
                    contentLength: response.headers['content-length']
                }
            });
        } catch (error) {
            res.json({
                success: true,
                url,
                accessible: false,
                error: error.message
            });
        }

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
