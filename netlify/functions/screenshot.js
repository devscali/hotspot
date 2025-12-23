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

        // Bloquear recursos pesados para acelerar
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            if (resourceType === 'media' || resourceType === 'font') {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Navegar con múltiples condiciones de espera
        await page.goto(targetUrl, {
            waitUntil: ['load', 'domcontentloaded', 'networkidle0'],
            timeout: 25000
        });

        // Esperar a que las imágenes carguen
        await page.evaluate(async () => {
            const images = Array.from(document.querySelectorAll('img'));
            await Promise.all(images.map(img => {
                if (img.complete) return Promise.resolve();
                return new Promise((resolve) => {
                    img.addEventListener('load', resolve);
                    img.addEventListener('error', resolve);
                    setTimeout(resolve, 3000);
                });
            }));
        });

        // Esperar por lazy-loaded content y animaciones
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Scroll para activar lazy loading
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                const distance = 500;
                const timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    if (totalHeight >= scrollHeight) {
                        clearInterval(timer);
                        window.scrollTo(0, 0);
                        resolve();
                    }
                }, 100);
            });
        });

        // Esperar después del scroll
        await new Promise(resolve => setTimeout(resolve, 1000));

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
