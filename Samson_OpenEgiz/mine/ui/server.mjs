import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const app = express();
app.use(express.json({ limit: '32kb' }));

const dittoUrl = (process.env.DITTO_URL || 'http://ditto-nginx:80').replace(/\/$/, '');
const simulatorUrl = (process.env.SIMULATOR_URL || 'http://mine-simulator:8091').replace(/\/$/, '');
const auth = Buffer.from(`ditto:${process.env.DITTO_PASSWORD || ''}`).toString('base64');

async function jsonFetch(url, options = {}, timeout = 5000) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

app.get('/api/health', async (_req, res) => {
  try {
    await jsonFetch(`${simulatorUrl}/health`);
    res.json({ ok: true, platform: 'OpenEgiz', twinStore: 'Eclipse Ditto', telemetry: 'MQTT' });
  } catch {
    res.status(503).json({ ok: false, platform: 'offline-trace' });
  }
});

app.get('/api/snapshot', async (_req, res) => {
  try {
    // Metadata/history come from the simulation; every live twin value below is
    // authoritative Ditto state, never a browser-side substitute.
    const current = await jsonFetch(`${simulatorUrl}/snapshot`);
    const entries = await Promise.all(Object.keys(current.things).map(async (id) => {
      const thing = await jsonFetch(`${dittoUrl}/api/2/things/${id}`, {
        headers: { Authorization: `Basic ${auth}` },
      });
      return [id, {
        kind: thing.attributes?.kind || current.things[id].kind,
        name: thing.attributes?.name || current.things[id].name,
        features: Object.fromEntries(Object.entries(thing.features || {}).map(([key, feature]) => [key, feature.properties || {}])),
      }];
    }));
    res.json({ ...current, things: Object.fromEntries(entries), source: 'openegiz' });
  } catch (error) {
    res.status(503).json({ error: 'OpenEgiz snapshot unavailable', detail: String(error.message || error) });
  }
});

app.post('/api/scenario', async (req, res) => {
  try {
    const result = await jsonFetch(`${simulatorUrl}/scenario`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body),
    });
    res.json(result);
  } catch (error) {
    res.status(503).json({ error: String(error.message || error) });
  }
});

app.post('/api/reset', async (_req, res) => {
  try {
    const result = await jsonFetch(`${simulatorUrl}/reset`, { method: 'POST' });
    res.json(result);
  } catch (error) {
    res.status(503).json({ error: String(error.message || error) });
  }
});

app.use(express.static(path.join(root, 'dist'), { maxAge: '1h', index: false }));
app.get('/{*splat}', (_req, res) => res.sendFile(path.join(root, 'dist/index.html')));

const port = Number(process.env.PORT || 8088);
app.listen(port, '0.0.0.0', () => console.log(`Samson UI listening on ${port}; Ditto: ${dittoUrl}`));
