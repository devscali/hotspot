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
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
        });

        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const buffer = await response.arrayBuffer();

        return {
            statusCode: 200,
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=3600'
            },
            body: Buffer.from(buffer).toString('base64'),
            isBase64Encoded: true
        };

    } catch (error) {
        console.error('Resource proxy error:', error);
        return {
            statusCode: 500,
            body: 'Error'
        };
    }
}
