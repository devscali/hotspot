import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

export async function handler(event) {
    const targetUrl = event.queryStringParameters?.url;
    const fullPage = event.queryStringParameters?.fullPage === 'true';
    const width = parseInt(event.queryStringParameters?.width) || 1440;
    const height = parseInt(event.queryStringParameters?.height) || 900;

    if (!targetUrl) {
        return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'URL requerida' })
        };
    }

    let browser = null;

    try {
        // Configurar Chromium para Netlify/AWS Lambda
        browser = await puppeteer.launch({
            args: [
                ...chromium.args,
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu'
            ],
            defaultViewport: { width, height, deviceScaleFactor: 1 },
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        });

        const page = await browser.newPage();

        // Configurar user agent
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');

        // NO bloquear nada - queremos que cargue todo
        // Navegar y esperar a que la red esté inactiva
        await page.goto(targetUrl, {
            waitUntil: 'networkidle0',
            timeout: 25000
        });

        // Esperar un poco después de la carga inicial
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Scroll lento por toda la página para activar lazy loading
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                const distance = 300;
                const timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    if (totalHeight >= scrollHeight) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 100);
            });
        });

        // Esperar a que carguen las imágenes lazy loaded
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Esperar explícitamente a que todas las imágenes estén cargadas
        await page.evaluate(async () => {
            // Esperar imágenes normales
            const images = Array.from(document.querySelectorAll('img'));
            await Promise.all(images.map(img => {
                if (img.complete && img.naturalHeight > 0) return Promise.resolve();
                return new Promise((resolve) => {
                    img.addEventListener('load', resolve);
                    img.addEventListener('error', resolve);
                    setTimeout(resolve, 5000);
                });
            }));

            // Esperar background images
            const elementsWithBg = Array.from(document.querySelectorAll('*')).filter(el => {
                const style = window.getComputedStyle(el);
                return style.backgroundImage && style.backgroundImage !== 'none';
            });

            // Forzar carga de background images
            await Promise.all(elementsWithBg.map(el => {
                const style = window.getComputedStyle(el);
                const bgImage = style.backgroundImage;
                const urlMatch = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
                if (urlMatch) {
                    return new Promise((resolve) => {
                        const img = new Image();
                        img.onload = resolve;
                        img.onerror = resolve;
                        img.src = urlMatch[1];
                        setTimeout(resolve, 3000);
                    });
                }
                return Promise.resolve();
            }));
        });

        // Esperar más para animaciones
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Scroll de vuelta arriba
        await page.evaluate(() => window.scrollTo(0, 0));
        await new Promise(resolve => setTimeout(resolve, 500));

        // Capturar screenshot
        const screenshot = await page.screenshot({
            type: 'png',
            fullPage: fullPage,
            encoding: 'base64'
        });

        // Obtener dimensiones del documento
        const dimensions = await page.evaluate(() => ({
            width: document.documentElement.scrollWidth,
            height: document.documentElement.scrollHeight,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight
        }));

        await browser.close();

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=300'
            },
            body: JSON.stringify({
                screenshot: `data:image/png;base64,${screenshot}`,
                dimensions,
                url: targetUrl
            })
        };

    } catch (error) {
        console.error('Screenshot error:', error);

        if (browser) {
            try {
                await browser.close();
            } catch (e) {
                console.error('Error closing browser:', e);
            }
        }

        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                error: 'Error al capturar screenshot',
                message: error.message
            })
        };
    }
}
