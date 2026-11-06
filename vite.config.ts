import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

function antigravityBridgePlugin() {
  return {
    name: 'antigravity-bridge',
    configureServer(server: any) {
      server.middlewares.use('/api/antigravity/status', (req: any, res: any) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            connected: true,
            mode: 'local-build-station',
            timestamp: new Date().toISOString(),
          })
        );
      });

      server.middlewares.use('/api/antigravity/request', (req: any, res: any) => {
        if (req.method === 'GET') {
          const reqPath = path.resolve(process.cwd(), 'workspace/active-request.json');
          res.setHeader('Content-Type', 'application/json');
          if (fs.existsSync(reqPath)) {
            res.end(fs.readFileSync(reqPath, 'utf-8'));
          } else {
            res.end(JSON.stringify({ request: null }));
          }
          return;
        }

        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => {
            body += chunk.toString();
          });
          req.on('end', () => {
            try {
              const payload = JSON.parse(body);
              const workspaceDir = path.resolve(process.cwd(), 'workspace');
              if (!fs.existsSync(workspaceDir)) {
                fs.mkdirSync(workspaceDir, { recursive: true });
              }
              const activePath = path.join(workspaceDir, 'active-request.json');
              const enriched = {
                ...payload,
                savedAt: new Date().toISOString(),
                status: 'pending_antigravity',
              };
              fs.writeFileSync(activePath, JSON.stringify(enriched, null, 2), 'utf-8');

              const historyPath = path.join(workspaceDir, 'request-history.json');
              let history: any[] = [];
              if (fs.existsSync(historyPath)) {
                try {
                  history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
                } catch {
                  history = [];
                }
              }
              history.unshift(enriched);
              fs.writeFileSync(historyPath, JSON.stringify(history.slice(0, 50), null, 2), 'utf-8');

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true, savedTo: 'workspace/active-request.json' }));
            } catch (err: any) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: err?.message || 'Invalid JSON' }));
            }
          });
          return;
        }
      });

      server.middlewares.use('/api/antigravity/save-vault', (req: any, res: any) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (chunk: any) => {
          body += chunk.toString();
        });
        req.on('end', () => {
          try {
            const vaultData = JSON.parse(body);
            // Security check: Ensure only encrypted ciphertext is ever written, never a raw AIza key!
            if (!vaultData.ciphertext || !vaultData.salt || !vaultData.iv) {
              throw new Error('Missing encrypted fields');
            }
            const vaultFile = path.resolve(process.cwd(), 'src/ai/vaultConfig.json');
            fs.writeFileSync(
              vaultFile,
              JSON.stringify(
                {
                  hasEncryptedVault: true,
                  ciphertext: vaultData.ciphertext,
                  salt: vaultData.salt,
                  iv: vaultData.iv,
                  hint: vaultData.hint || 'Familjelösenord',
                  updatedAt: new Date().toISOString(),
                },
                null,
                2
              ),
              'utf-8'
            );
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (err: any) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: err?.message }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), antigravityBridgePlugin()],
  optimizeDeps: {
    exclude: ['replicad-opencascadejs'],
  },
  assetsInclude: ['**/*.wasm'],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 30000,
  },
});
