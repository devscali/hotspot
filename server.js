const express = require('express');
const path = require('path');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Screenshot endpoint - versión simplificada y robusta
app.get('/screenshot', async (req, res) => {
    const targetUrl = req.query.url;
    const fullPage = req.query.fullPage === 'true';
    const width = parseInt(req.query.width) || 1440;
    const height = parseInt(req.query.height) || 900;

    if (!targetUrl) {
        return res.status(400).json({ error: 'URL requerida' });
    }

    let browser = null;

    try {
        console.log('Iniciando captura de:', targetUrl);

        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1920,1080'
            ]
        });

        const page = await browser.newPage();
        await page.setViewport({ width, height, deviceScaleFactor: 1 });
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Navegar a la página
        console.log('Navegando a la página...');
        await page.goto(targetUrl, {
            waitUntil: 'networkidle2', // Menos estricto que networkidle0
            timeout: 30000
        });

        // Esperar a que el DOM esté listo
        await page.waitForSelector('body', { timeout: 5000 }).catch(() => {});

        console.log('Página cargada, esperando contenido...');

        // Esperar un momento para que cargue el contenido inicial
        await new Promise(r => setTimeout(r, 2000));

        // Scroll para activar lazy loading
        console.log('Haciendo scroll para activar lazy loading...');
        await autoScroll(page);

        // Esperar a que las imágenes terminen de cargar
        console.log('Esperando imágenes...');
        await page.evaluate(async () => {
            // Esperar a que todas las imágenes estén cargadas
            const images = document.querySelectorAll('img');
            const promises = Array.from(images).map(img => {
                if (img.complete) return Promise.resolve();
                return new Promise(resolve => {
                    img.onload = resolve;
                    img.onerror = resolve;
                    // Timeout por imagen
                    setTimeout(resolve, 3000);
                });
            });
            await Promise.all(promises);
        });

        // Esperar un poco más para animaciones
        await new Promise(r => setTimeout(r, 1000));

        // Volver arriba
        await page.evaluate(() => window.scrollTo(0, 0));
        await new Promise(r => setTimeout(r, 500));

        console.log('Capturando screenshot...');
        // Capturar screenshot
        const screenshot = await page.screenshot({
            type: 'png',
            fullPage: fullPage,
            encoding: 'base64'
        });

        const dimensions = await page.evaluate(() => ({
            width: document.documentElement.scrollWidth,
            height: document.documentElement.scrollHeight,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight
        }));

        await browser.close();
        console.log('Screenshot completado exitosamente');

        res.json({
            screenshot: `data:image/png;base64,${screenshot}`,
            dimensions,
            url: targetUrl
        });

    } catch (error) {
        console.error('Screenshot error:', error.message);
        if (browser) {
            try {
                await browser.close();
            } catch (e) {
                // Ignorar error al cerrar
            }
        }
        res.status(500).json({
            error: 'Error al capturar screenshot',
            message: error.message
        });
    }
});

// Función de auto-scroll mejorada
async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 400;
            const maxScrolls = 50; // Límite de scrolls
            let scrollCount = 0;

            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
                scrollCount++;

                if (totalHeight >= scrollHeight || scrollCount >= maxScrolls) {
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });
}

// Proxy endpoint - reescribe el HTML e inyecta nuestro script
app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).send('URL requerida');
    }

    try {
        const fetch = (await import('node-fetch')).default;

        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            },
            redirect: 'follow'
        });

        if (!response.ok) {
            return res.status(response.status).send('Error al cargar la página: ' + response.statusText);
        }

        const contentType = response.headers.get('content-type') || '';

        // Si no es HTML, pasar el contenido directamente
        if (!contentType.includes('text/html')) {
            const buffer = await response.buffer();
            res.set('Content-Type', contentType);
            return res.send(buffer);
        }

        let html = await response.text();
        const baseUrl = new URL(targetUrl);

        // Script que inyectamos para comunicar scroll
        const injectedScript = `
        <script>
        (function() {
            console.log('[Hotspot] Script inyectado correctamente');

            // Comunicar scroll al padre
            function sendScroll() {
                window.parent.postMessage({
                    type: 'hotspot-scroll',
                    scrollX: window.scrollX || window.pageXOffset || 0,
                    scrollY: window.scrollY || window.pageYOffset || 0
                }, '*');
            }

            // Comunicar tamaño del documento
            function sendSize() {
                window.parent.postMessage({
                    type: 'hotspot-size',
                    width: document.documentElement.scrollWidth,
                    height: document.documentElement.scrollHeight
                }, '*');
            }

            // Escuchar eventos de scroll
            window.addEventListener('scroll', sendScroll, { passive: true });
            window.addEventListener('resize', sendSize, { passive: true });

            // También capturar scroll en el documento
            document.addEventListener('scroll', sendScroll, { passive: true });

            // Enviar estado inicial cuando cargue
            window.addEventListener('load', function() {
                console.log('[Hotspot] Página cargada, enviando scroll inicial');
                sendScroll();
                sendSize();
            });

            // Enviar inmediatamente y cada 100ms los primeros segundos
            sendScroll();
            sendSize();

            var count = 0;
            var interval = setInterval(function() {
                sendScroll();
                count++;
                if (count > 20) clearInterval(interval);
            }, 100);
        })();
        </script>
        `;

        // Base href para recursos relativos
        const baseHref = `<base href="${baseUrl.origin}${baseUrl.pathname.replace(/\/[^\/]*$/, '/')}">`;

        // Inyectar base href después de <head>
        if (html.match(/<head[^>]*>/i)) {
            html = html.replace(/<head[^>]*>/i, '$&' + baseHref);
        } else {
            html = baseHref + html;
        }

        // Inyectar script antes de </body> o al final
        if (html.match(/<\/body>/i)) {
            html = html.replace(/<\/body>/i, injectedScript + '</body>');
        } else if (html.match(/<\/html>/i)) {
            html = html.replace(/<\/html>/i, injectedScript + '</html>');
        } else {
            html = html + injectedScript;
        }

        // Headers para permitir iframe
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.set('X-Frame-Options', 'ALLOWALL');
        res.removeHeader('X-Frame-Options');
        res.set('Content-Security-Policy', '');
        res.removeHeader('Content-Security-Policy');

        res.send(html);

    } catch (error) {
        console.error('Proxy error:', error);
        res.status(500).send(`
            <html>
            <body style="font-family: sans-serif; padding: 40px; text-align: center;">
                <h1>Error al cargar la página</h1>
                <p>${error.message}</p>
                <p>URL: ${targetUrl}</p>
            </body>
            </html>
        `);
    }
});

app.listen(PORT, () => {
    console.log(`Hotspot server running on http://localhost:${PORT}`);
});
