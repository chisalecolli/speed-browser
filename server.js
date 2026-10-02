const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable basic CORS for mobile client requests
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
});

// Main Web Proxy Gateway Endpoint
app.get('/render', async (req, res) => {
    let targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).send('<h1>Error: Please supply a URL query parameter (e.g., /render?url=https://wikipedia.org)</h1>');
    }

    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = 'http://' + targetUrl;
    }

    try {
        // 1. Fetch webpage with browser user-agent
        const response = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) JetBitsProxy/1.0'
            },
            timeout: 10000
        });

        // 2. Parse HTML string
        const $ = cheerio.load(response.data);

        // 3. Strip memory-heavy and client-blocking elements
        $('script').remove();$('style').remove();
        $('iframe').remove();$('svg').remove();
        $('noscript').remove();$('[style]').removeAttr('style'); // Strip inline CSS styles

        // 4. Rewrite absolute image sources and remove huge backgrounds
        $('img').each((_, el) => {
            const src = $(el).attr('src');
            if (src && !src.startsWith('http')) {
                try {
                    const resolved = new URL(src, targetUrl).href;
                    $(el).attr('src', resolved);
                } catch (e) {}
            }
        });

        // 5. Rewrite links to keep browsing through our Proxy Engine
        $('a').each((_, el) => {
            const href = $(el).attr('href');
            if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
                try {
                    const resolved = new URL(href, targetUrl).href;
                    $(el).attr('href', `/render?url=${encodeURIComponent(resolved)}`);
                } catch (e) {}
            }
        });

        // 6. Return cleaned, low-bandwidth HTML
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send($.html());

    } catch (error) {
        res.status(500).send(`<h3>Proxy Error</h3><p>Could not load <b>${targetUrl}</b>: ${error.message}</p>`);
    }
});

// Health check route for Render ping
app.get('/', (req, res) => {
    res.send('<h1>JetBits Opera-Style Proxy Engine is Running</h1><p>Usage: <code>/render?url=http://example.com</code></p>');
});

app.listen(PORT, () => {
    console.log(`Proxy server listening on port ${PORT}`);
});
