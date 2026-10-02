const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { Window } = require('happy-dom');

const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
});

app.get('/render', async (req, res) => {
    let targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).send('<h3>Error: Missing target URL parameter.</h3>');
    }

    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = 'http://' + targetUrl;
    }

    try {
        // 1. Fetch raw HTML content
        const response = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SpeedBrowser/1.0'
            },
            timeout: 8000
        });

        // 2. Initialize lightweight virtual DOM engine
        const window = new Window({
            url: targetUrl,
            settings: {
                disableJavaScriptEvaluation: false, // Enable JavaScript execution
                disableCSSFileLoading: true,        // Skip heavy CSS downloads to save bandwidth
                disableIframePageLoading: true
            }
        });

        const document = window.document;
        document.write(response.data);

        // Wait brief moment for dynamic client scripts to execute
        await new Promise(resolve => setTimeout(resolve, 500));

        // 3. Get rendered HTML snapshot and close virtual window
        const renderedHtml = document.documentElement.outerHTML;
        window.close();

        // 4. Optimize and strip heavy elements for J2ME output
        const $ = cheerio.load(renderedHtml);

        $('script').remove();$('iframe').remove();
        $('svg').remove();$('noscript').remove();

        // Rewrite relative links to funnel through Render proxy
        $('a').each((_, el) => {
            const href = $(el).attr('href');
            if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
                try {
                    const resolved = new URL(href, targetUrl).href;
                    $(el).attr('href', `/render?url=${encodeURIComponent(resolved)}`);
                } catch (e) {}
            }
        });

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send($.html());

    } catch (error) {
        res.status(500).send(`<h3>Proxy Error</h3><p>Could not render <b>${targetUrl}</b>: ${error.message}</p>`);
    }
});

app.get('/', (req, res) => {
    res.send('<h1>SpeedBrowser Proxy Active</h1><p>Usage: <code>/render?url=http://example.com</code></p>');
});

app.listen(PORT, () => console.log(`Proxy listening on port ${PORT}`));
