const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 3000;

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36';

app.get('/', (req, res) => {
    res.send('SpeedBrowser Proxy is Live!');
});

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

        $('script, style, iframe, svg, noscript, video, audio, source, canvas').remove();

        $('h1, h2, h3, h4, h5, h6').each((_, el) => {
            const level = el.tagName.toLowerCase();
            const text = $(el).text().trim();$(el).replaceWith(`<${level}>${text}</${level}><br>`);
        });

        $('img').each((_, el) => {
            let src = $(el).attr('src') \vert{}\vert{}$(el).attr('data-src');
            if (!src) {
                $(el).remove();
                return;
            }

            try {
                const absoluteUrl = new URL(src, targetUrl).href;
                const altText = $(el).attr('alt') \vert{}\vert{} 'Image';$(el).replaceWith(`<img src="${absoluteUrl}" alt="${altText}">`);
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

app.listen(PORT, () => {
    console.log(`Server running on port 
    ${PORT}`);
});
