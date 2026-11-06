import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve(process.cwd(), 'dist');
if (!fs.existsSync(distDir)) {
  throw new Error('dist directory does not exist. Run npm run build first.');
}

// Create .nojekyll so GitHub Pages serves all assets and WASM files cleanly
fs.writeFileSync(path.join(distDir, '.nojekyll'), '');

console.log('Deploying dist/ to gh-pages branch on origin...');
execSync('git init', { cwd: distDir, stdio: 'inherit' });
execSync('git checkout -B gh-pages', { cwd: distDir, stdio: 'inherit' });
execSync('git add -A', { cwd: distDir, stdio: 'inherit' });
execSync('git commit -m "deploy: publish Antigravity 3D CAD Studio to GitHub Pages"', {
  cwd: distDir,
  stdio: 'inherit',
});
execSync('git push -f https://github.com/jojje2/3D-prints.git gh-pages:gh-pages', {
  cwd: distDir,
  stdio: 'inherit',
});
console.log('✓ Pushed gh-pages branch!');
