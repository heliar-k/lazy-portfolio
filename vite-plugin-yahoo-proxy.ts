/**
 * Vite plugin: proxy Yahoo Finance API requests through local HTTP proxy.
 *
 * Browser fetch requests to /api/yahoo/* are forwarded to Yahoo Finance
 * via the local proxy (127.0.0.1:7890) which has unrestricted access.
 */
import type { Plugin, ViteDevServer } from 'vite';

const PROXY_URL = process.env.PROXY_URL || 'http://127.0.0.1:7890';

export function yahooFinanceProxy(): Plugin {
  return {
    name: 'yahoo-finance-proxy',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/yahoo', async (req, res) => {
        const targetUrl = 'https://query1.finance.yahoo.com' + req.url!.replace(/^\/api\/yahoo/, '');

        try {
          const { ProxyAgent } = await import('undici');
          const agent = new ProxyAgent(PROXY_URL);

          const yahooRes = await fetch(targetUrl, {
            method: req.method as string,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
              'Accept': req.headers['accept'] || '*/*',
            },
            // @ts-ignore undici dispatcher
            dispatcher: agent,
          });

          res.statusCode = yahooRes.status;
          res.setHeader('Content-Type', yahooRes.headers.get('content-type') || 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');

          if (yahooRes.ok) {
            const body = await yahooRes.arrayBuffer();
            res.end(Buffer.from(body));
          } else {
            res.statusCode = yahooRes.status;
            res.end(JSON.stringify({ error: `Yahoo returned ${yahooRes.status}` }));
          }
        } catch (err) {
          console.error(`[yahoo-proxy] Error: ${(err as Error).message}`);
          res.statusCode = 502;
          res.end(JSON.stringify({ error: 'Proxy request failed' }));
        }
      });
    },
  };
}
