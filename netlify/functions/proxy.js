export async function handler(event) {
    const targetUrl = event.queryStringParameters?.url;

    if (!targetUrl) {
        return {
            statusCode: 400,
            body: 'URL requerida'
        };
    }

    try {
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        if (!response.ok) {
            return {
                statusCode: response.status,
                body: 'Error al cargar la página'
            };
        }

        const contentType = response.headers.get('content-type') || '';

        // Si no es HTML, pasar el contenido directamente
        if (!contentType.includes('text/html')) {
            const buffer = await response.arrayBuffer();
            return {
                statusCode: 200,
                headers: { 'Content-Type': contentType },
                body: Buffer.from(buffer).toString('base64'),
                isBase64Encoded: true
            };
        }

        let html = await response.text();
        const baseUrl = new URL(targetUrl);

        // Script que inyectamos para comunicar scroll, tamaño y cambios de URL
        const injectedScript = `
        <script>
        (function() {
            var lastUrl = window.location.href;

            function sendScroll() {
                window.parent.postMessage({
                    type: 'hotspot-scroll',
                    scrollX: window.scrollX,
                    scrollY: window.scrollY
                }, '*');
            }

            function sendSize() {
                window.parent.postMessage({
                    type: 'hotspot-size',
                    width: document.documentElement.scrollWidth,
                    height: document.documentElement.scrollHeight
                }, '*');
            }

            function sendUrl() {
                var currentUrl = window.location.href;
                if (currentUrl !== lastUrl) {
                    lastUrl = currentUrl;
                    window.parent.postMessage({
                        type: 'hotspot-url',
                        url: currentUrl
                    }, '*');
                }
            }

            window.addEventListener('scroll', sendScroll, { passive: true });
            window.addEventListener('resize', sendSize, { passive: true });
            window.addEventListener('hashchange', sendUrl, { passive: true });
            window.addEventListener('popstate', sendUrl, { passive: true });

            // Interceptar clicks en links para detectar navegación
            document.addEventListener('click', function(e) {
                var link = e.target.closest('a');
                if (link && link.href) {
                    setTimeout(sendUrl, 100);
                }
            }, true);

            window.addEventListener('load', function() {
                sendScroll();
                sendSize();
                // Enviar URL inicial
                window.parent.postMessage({
                    type: 'hotspot-url',
                    url: window.location.href
                }, '*');
            });

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

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
            body: html
        };

    } catch (error) {
        console.error('Proxy error:', error);
        return {
            statusCode: 500,
            body: 'Error al procesar la página: ' + error.message
        };
    }
}
