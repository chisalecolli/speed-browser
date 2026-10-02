const express = require('express');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

let browser = null;

// Initialize headless Chromium instance
async function getBrowser() {
    if (!browser) {
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--single-process'
            ]
        });
    }
    return browser;
}

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

    let page = null;
    try {
        const browserInstance = await getBrowser();
        page = await browserInstance.newPage();

        // Block heavy media (video/fonts) to save proxy RAM & speed up load times
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            if (resourceType === 'media' || resourceType === 'font') {
                req.abort();
            } else {
                req.continue();
            }
        });

        // 1. Load URL and execute client JavaScript
        await page.goto(targetUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 12000
        });

        // Wait 1.5s for dynamic SPA/React/Vue scripts to render DOM
        await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 1500)));

        // 2. Extract final rendered HTML DOM
        const renderedHtml = await page.content();
        await page.close();

        // 3. Clean and optimize DOM for J2ME feature phone
        const $ = cheerio.load(renderedHtml);

        $('script').remove();   // Remove scripts now that execution is complete
        $('iframe').remove();   // Strip third-party frames/ads$('svg').remove();

        // Convert links to route back through our proxy
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
        if (page) await page.close().catch(() => {});
        res.status(500).send(`<h3>Render Error</h3><p>Could not process page: ${error.message}</p>`);
    }
});

app.get('/', (req, res) => {
    res.send('<h1>SpeedBrowser Headless Proxy Engine</h1><p>Active with JavaScript & HTML5 Rendering support.</p>');
});

app.listen(PORT, () => console.log(`Server live on port ${PORT}`));
