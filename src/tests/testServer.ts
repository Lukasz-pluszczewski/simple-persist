import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import request, { Test } from 'supertest';
import TestAgent from 'supertest/lib/agent';
import { persistCollection, persistKeyValue } from '../express';

export interface TestServer {
  app: express.Express;
  server: http.Server;
  baseURL: string;
  close: () => Promise<void>;
  agent: TestAgent<Test>;
}

function tmpDir(prefix = 'sp-e2e-') {
  const d = path.join(
    process.cwd(),
    '.tmp',
    prefix + Math.random().toString(36).slice(2)
  );
  fs.mkdirSync(d, { recursive: true });
  return d;
}

export async function createTestServer(): Promise<TestServer> {
  const baseDir = tmpDir();
  const app = express();

  // Tenancy for tests: via query param (?tenant=abc) or fallback to 'default'
  const getTenant = (req: express.Request) => {
    const t = (req.query?.tenant as string) || 'default';
    return t || 'default';
  };

  app.use('/kv', persistKeyValue('kv-e2e', { baseDir, getTenant }));
  app.use(
    '/todos',
    persistCollection('todos-e2e', {
      baseDir,
      getTenant,
      validation: (item: any) =>
        typeof item?.id === 'string' ? true : typeof item?.text === 'string',
    })
  );

  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Failed to bind server');
  const baseURL = `http://127.0.0.1:${address.port}`;

  const agent = request(app);

  return {
    app,
    server,
    baseURL,
    agent,
    close: async () => new Promise((r) => server.close(() => r())),
  };
}
