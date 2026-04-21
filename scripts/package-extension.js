import fs from 'fs';
import path from 'path';

const root = process.cwd();
const extensionDir = path.join(root, 'extension');
const outputDir = path.join(root, 'extension-build');

/** Top-level names under extension/ that must not ship to the Web Store (stale artifacts, zips). */
const SKIP_TOP_LEVEL = new Set(['build']);

const copyRecursive = (src, dest, depth = 0) => {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    const base = path.basename(src);
    if (depth === 1 && SKIP_TOP_LEVEL.has(base)) return;
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry), depth + 1);
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
};

if (!fs.existsSync(extensionDir)) {
  console.error('[package:extension] extension directory not found');
  process.exit(1);
}

fs.rmSync(outputDir, { recursive: true, force: true });
copyRecursive(extensionDir, outputDir);

console.log(`[package:extension] Packaged extension to ${outputDir}`);
