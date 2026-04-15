import fs from 'fs';
import path from 'path';

const root = process.cwd();
const extensionDir = path.join(root, 'extension');
const manifestPath = path.join(extensionDir, 'manifest.json');

const fail = (message) => {
  console.error(`[verify:extension] ${message}`);
  process.exit(1);
};

if (!fs.existsSync(manifestPath)) {
  fail('manifest.json not found in extension directory');
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const referencedFiles = new Set();

if (manifest.background?.service_worker) referencedFiles.add(manifest.background.service_worker);
if (manifest.action?.default_popup) referencedFiles.add(manifest.action.default_popup);
Object.values(manifest.icons || {}).forEach((p) => referencedFiles.add(p));
(manifest.content_scripts || []).forEach((entry) => {
  (entry.js || []).forEach((p) => referencedFiles.add(p));
  (entry.css || []).forEach((p) => referencedFiles.add(p));
});

const missing = [];
for (const relativePath of referencedFiles) {
  const absolutePath = path.join(extensionDir, relativePath);
  if (!fs.existsSync(absolutePath)) missing.push(relativePath);
}

if (missing.length) {
  fail(`Missing manifest references:\n- ${missing.join('\n- ')}`);
}

const hosts = manifest.host_permissions || [];
const hasXHost = hosts.some((h) => h.includes('x.com'));
const hasTwitterHost = hosts.some((h) => h.includes('twitter.com'));
if (!hasXHost || !hasTwitterHost) {
  fail('host_permissions must include both x.com and twitter.com domains');
}

console.log(`[verify:extension] OK (${referencedFiles.size} references checked)`);
