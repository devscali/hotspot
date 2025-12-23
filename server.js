const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Proxy endpoint - reescribe el HTML e inyecta nuestro script
app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).send('URL requerida');
    }

    try {
        // Usar fetch dinámico (ESM)
        const fetch = (await import('node-fetch')).default;

        // Obtener el HTML de la página
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        if (!response.ok) {
            return res.status(response.status).send('Error al cargar la página');
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
            // Comunicar scroll al padre
            function sendScroll() {
                window.parent.postMessage({
                    type: 'hotspot-scroll',
                    scrollX: window.scrollX,
                    scrollY: window.scrollY
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

            // Escuchar eventos
            window.addEventListener('scroll', sendScroll, { passive: true });
            window.addEventListener('resize', sendSize, { passive: true });

            // Enviar estado inicial
            window.addEventListener('load', function() {
                sendScroll();
                sendSize();
            });

            // Enviar inmediatamente también
            setTimeout(function() {
                sendScroll();
                sendSize();
            }, 100);
        })();
        </script>
        `;

        // Reescribir URLs relativas a absolutas
        const baseHref = `<base href="${baseUrl.origin}${baseUrl.pathname.replace(/\/[^\/]*$/, '/')}">`;

        // Inyectar base href y script
        if (html.includes('<head>')) {
            html = html.replace('<head>', '<head>' + baseHref);
        } else if (html.includes('<HEAD>')) {
            html = html.replace('<HEAD>', '<HEAD>' + baseHref);
        } else {
            html = baseHref + html;
        }

        // Inyectar script antes de </body>
        if (html.includes('</body>')) {
            html = html.replace('</body>', injectedScript + '</body>');
        } else if (html.includes('</BODY>')) {
            html = html.replace('</BODY>', injectedScript + '</BODY>');
        } else {
            html = html + injectedScript;
        }

        res.set('Content-Type', 'text/html');
        res.send(html);

    } catch (error) {
        console.error('Proxy error:', error);
        res.status(500).send('Error al procesar la página: ' + error.message);
    }
});

// Proxy para recursos (CSS, JS, imágenes)
app.get('/proxy-resource', async (req, res) => {
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).send('URL requerida');
    }

    try {
        const fetch = (await import('node-fetch')).default;

        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
        });

        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const buffer = await response.buffer();

        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'public, max-age=3600');
        res.send(buffer);

    } catch (error) {
        console.error('Resource proxy error:', error);
        res.status(500).send('Error');
    }
});

app.listen(PORT, () => {
    console.log(`Hotspot server running on http://localhost:${PORT}`);
});
