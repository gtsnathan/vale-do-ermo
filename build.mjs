import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/opt/npm-tools/');
let esbuild;
try { esbuild = (await import('esbuild')).default; } catch { esbuild = require('esbuild'); }
const res = await esbuild.build({ entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife', target: 'es2020', write: false, charset: 'utf8' });
const js = res.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const tpl = fs.readFileSync('index.template.html', 'utf8');
fs.mkdirSync('dist', { recursive: true });
const artifact = tpl.replace('/*__BUNDLE__*/', () => js);
fs.writeFileSync('dist/vale-do-ermo.html', artifact);
// Versão independente para hospedar (Cloudflare etc.): documento completo.
fs.writeFileSync('dist/index.html', `<!doctype html>\n<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n${artifact.replace('<div id="stage">', '</head><body><div id="stage">')}\n</body></html>\n`);
console.log('ok', (artifact.length / 1024).toFixed(0), 'KB');
