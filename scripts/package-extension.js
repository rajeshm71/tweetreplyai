import fs from 'fs';
import path from 'path';

const root = process.cwd();
const extensionDir = path.join(root, 'extension');
const outputDir = path.join(root, 'extension-build');

const copyRecursive = (src, dest) => {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
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
