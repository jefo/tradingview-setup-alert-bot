import express, { type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { config } from "./config";
import { publisherClient } from "./redis";

const app = express();

// TradingView sends text/plain by default, but users often switch to JSON.
// Accept any content type and handle the raw body ourselves.
app.use(express.text({ type: '*/*', limit: '16kb' }));

const alertLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many alerts, slow down',
});

console.log("api.port", config.api.port);
console.log("api.redis.url", config.redis.url.replace(/\/\/.*@/, '//***@'));
if (!config.api.webhookSecret) {
  console.warn("WEBHOOK_SECRET is empty: /alert is open. Set it before exposing the API.");
}

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.json({ status: 'healthy', timestamp: new Date() });
});

app.get("/ping", (req: Request, res: Response) => res.send("pong"));

function isAuthorized(req: Request): boolean {
  const secret = config.api.webhookSecret;
  if (!secret) return true;
  const header = req.header('x-webhook-secret');
  const query = typeof req.query.secret === 'string' ? req.query.secret : undefined;
  return header === secret || query === secret;
}

app.post("/alert", alertLimiter, async (req: Request, res: Response) => {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const body = typeof req.body === 'string' ? req.body.trim() : '';
  if (!body) {
    res.status(400).json({ error: 'Empty alert body' });
    return;
  }

  try {
    console.log("/alert received", { length: body.length, preview: body.slice(0, 120) });

    // Publish raw signal to Redis. The publisher is configured to fail fast,
    // so a dead Redis becomes a quick 503 instead of a hanging webhook.
    await publisherClient.publish('raw_signals', body);

    await publisherClient.publish('monitoring', JSON.stringify({
      type: 'info',
      service: 'api',
      event: 'signal_received',
      timestamp: new Date()
    }));

    res.status(200).send("ok");
  } catch (error: unknown) {
    console.error('Error processing alert:', error instanceof Error ? error.message : error);

    try {
      await publisherClient.publish('monitoring', JSON.stringify({
        type: 'error',
        service: 'api',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      }));
    } catch {
      // Monitoring is best-effort; never mask the original failure.
    }

    res.status(503).json({ error: 'Signal queue unavailable' });
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await publisherClient.quit();
  process.exit(0);
});

// Export for testing
export const server = app.listen(config.api.port, () => {
  console.log(`Server is running on port ${config.api.port}`);
});

export { app };
