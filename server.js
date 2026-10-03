const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const Jimp = require('jimp');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 3000;

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36';

// -----------------------------------------------------------------------------
// 1. PAGE RENDERER (Translates Web Pages into J2ME-Friendly HTML/CSS)
// -----------------------------------------------------------------------------
app.get('/render', async (req, res) => {
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).send('Missing "url" parameter');
    }

    try {
        const response = await axios.get(targetUrl, {
            headers: { 'User-Agent': USER_AGENT },
            timeout: 10000
        });

        const $ = cheerio.load(response.data);

        // Strip heavy & unrenderable elements (JS scripts, frames, videos)
        $('script, style, iframe, svg, noscript, video, audio, source, canvas').remove();

        // Convert CSS headings into simplified structure
        $('h1, h2, h3, h4, h5, h6').each((_, el) => {
            const level = el.tagName.toLowerCase();
            const text = $(el).text().trim();$(el).replaceWith(`<${level}>${text}</${level}><br>`);
        });

        // Extract basic CSS text and background colors
        $('[style]').each((_, el) => {
            const style = $(el).attr('style') || '';
            const colorMatch = style.match(/color\s*:\s*(#[0-9a-fA-F]{3,6}|rgb\([^)]+\))/);
            if (colorMatch) $(el).attr('data-color', colorMatch[1]);

            const bgMatch = style.match(/background(-color)?\s*:\s*(#[0-9a-fA-F]{3,6}|rgb\([^)]+\))/);
            if (bgMatch) $(el).attr('data-bg', bgMatch[1]);
        });

        // Rewrite image links to point to our downscaling proxy route
        const host = req.protocol + '://' + req.get('host');
        $('img').each((_, el) => {
            let src = $(el).attr('src') \vert{}\vert{}$(el).attr('data-src');
            if (!src) return $(el).remove();

            try {
                src = new URL(src, targetUrl).href;
                const proxyImgUrl = `${host}/image?url=${encodeURIComponent(src)}`;
                const altText = $(el).attr('alt') \vert{}\vert{} 'Image';$(el).replaceWith(`<img src="${proxyImgUrl}" alt="${altText}">`);
            } catch (e) {
                $(el).remove();
            }
        });

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send($.html());

    } catch (err) {
        res.status(500).send(`Proxy Error: ${err.message}`);
    }
});

// -----------------------------------------------------------------------------
// 2. IMAGE RESIZER (Converts images to J2ME JPEG format using pure JS)
// -----------------------------------------------------------------------------
app.get('/image', async (req, res) => {
    const imageUrl = req.query.url;

    if (!imageUrl) return res.status(400).send('Missing url');

    try {
        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': USER_AGENT },
            timeout: 8000
        });

        // Resize image to 200px max width using Jimp (100% Pure JS)
        const image = await Jimp.read(Buffer.from(response.data));
        image.resize(200, Jimp.AUTO); // Scale width to 200px preserving ratio
        image.quality(60);            // Lower quality for fast GPRS download

        const buffer = await image.getBufferAsync(Jimp.MIME_JPEG);
        res.setHeader('Content-Type', 'image/jpeg');
        res.send(buffer);

    } catch (err) {
        // Transparent 1x1 fallback if image fails
        const fallback = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
        res.setHeader('Content-Type', 'image/png');
        res.send(fallback);
    }
});

app.listen(PORT, () => {
    console.log(`Server running o
                    n port ${PORT}`);
});
