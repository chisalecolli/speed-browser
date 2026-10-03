const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const sharp = require('sharp');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 3000;
const SERVER_BASE_URL = process.env.SERVER_BASE_URL || `http://localhost:${PORT}`;

// User-Agent to mimic a standard browser when fetching target sites
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// -----------------------------------------------------------------------------
// 1. HTML & CSS RENDER ENDPOINT (/render?url=...)
// -----------------------------------------------------------------------------
app.get('/render', async (req, res) => {
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).send('Missing "url" parameter');
    }

    try {
        // Fetch target webpage HTML
        const response = await axios.get(targetUrl, {
            headers: { 'User-Agent': USER_AGENT },
            timeout: 10000
        });

        const $ = cheerio.load(response.data);

        // Strip non-renderable & heavy elements
        $('script, style, iframe, svg, noscript, video, audio, source, canvas').remove();

        // --- CSS & STYLE EXTRACTION ---
        // Convert headings to simplified structured tags
        $('h1, h2, h3, h4, h5, h6').each((_, el) => {
            const level = el.tagName.toLowerCase();
            const text = $(el).text().trim();$(el).replaceWith(`<${level}>${text}</${level}><br>`);
        });

        // Extract basic CSS text colors and background styling
        $('[style]').each((_, el) => {
            const style = $(el).attr('style') || '';
            
            // Extract text color (hex or rgb)
            const colorMatch = style.match(/color\s*:\s*(#[0-9a-fA-F]{3,6}|rgb\([^)]+\))/);
            if (colorMatch) {
                $(el).attr('data-color', colorMatch[1]);
            }

            // Extract background color
            const bgMatch = style.match(/background(-color)?\s*:\s*(#[0-9a-fA-F]{3,6}|rgb\([^)]+\))/);
            if (bgMatch) {
                $(el).attr('data-bg', bgMatch[1]);
            }
        });

        // --- IMAGE PROXYING & DOWNSCALING ---
        $('img').each((_, el) => {
            let src = $(el).attr('src') \vert{}\vert{}$(el).attr('data-src');
            if (!src) {
                $(el).remove();
                return;
            }

            // Resolve relative URLs to absolute URLs
            try {
                src = new URL(src, targetUrl).href;
            } catch (e) {
                $(el).remove();
                return;
            }

            // Replace original image URL with our server's downscaling proxy route
            // Max width set to 220px to fit standard J2ME screens (240x320 or 176x220)
            const proxyImgUrl = `${SERVER_BASE_URL}/image?url=${encodeURIComponent(src)}&width=220`;
            
            const altText = $(el).attr('alt') \vert{}\vert{} 'Image';$(el).replaceWith(`<img src="${proxyImgUrl}" alt="${altText}">`);
        });

        // Clean output HTML
        const cleanedHtml = $.html();
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(cleanedHtml);

    } catch (err) {
        res.status(500).send(`Proxy Error: ${err.message}`);
    }
});

// -----------------------------------------------------------------------------
// 2. IMAGE DOWNSCALING & TRANSCODING ENDPOINT (/image?url=...&width=220)
// -----------------------------------------------------------------------------
app.get('/image', async (req, res) => {
    const imageUrl = req.query.url;
    const maxWidth = parseInt(req.query.width) || 220; // Default max 220px width

    if (!imageUrl) {
        return res.status(400).send('Missing "url" parameter');
    }

    try {
        // Fetch raw image binary stream
        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': USER_AGENT },
            timeout: 8000
        });

        const imageBuffer = Buffer.from(response.data);

        // Process image with Sharp:
        // 1. Convert WebP/AVIF/SVG/GIF to standard JPEG (supported by J2ME MIDP 2.0 LCDUI)
        // 2. Downscale width to phone screen dimensions preserving aspect ratio
        // 3. Compress to reduce cellular data usage (GPRS/EDGE friendly)
        const processedImage = await sharp(imageBuffer)
            .resize({ width: maxWidth, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 65, progressive: false }) // Baseline JPEG for old handsets
            .toBuffer();

        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
        res.send(processedImage);

    } catch (err) {
        // Fallback: Return a 1x1 transparent PNG if image processing or fetching fails
        const emptyPng = Buffer.from(
            'iVBORw0KGgoAAAANSUEngineAAAABJRU5ErkJggg==',
            'base64'
        );
        res.setHeader('Content-Type', 'image/png');
        res.send(emptyPng);
    }
});

app.listen(PORT, () => {
    console.log(`SpeedBrowser Proxy Server running on port ${PORT}`);
});
