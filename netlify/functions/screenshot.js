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
            body: JSON.stringify({ error: 'URL requerida' })
        };
    }

    let browser = null;

    try {
        // Configurar Chromium para Netlify
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: { width, height },
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        });

        const page = await browser.newPage();

        // Configurar user agent
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Navegar a la URL
        await page.goto(targetUrl, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // Esperar un poco para que carguen animaciones/JS
        await page.waitForTimeout(1000);

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
                'Cache-Control': 'public, max-age=300' // Cache 5 min
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
            await browser.close();
        }

        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Error al capturar screenshot',
                message: error.message
            })
        };
    }
}
