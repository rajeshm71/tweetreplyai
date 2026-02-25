#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const extensionDir = 'extension';
const buildDir = 'extension-build';

console.log('🚀 Building Chrome extension for production...');

// Ensure build directory exists (do not wipe - avoids Chrome cold SW / loading screen on reload)
fs.mkdirSync(buildDir, { recursive: true });

// Build extension scripts
console.log('📦 Bundling extension scripts...');
try {
  execSync('npm run build:extension', { stdio: 'inherit' });
  execSync('npm run build:extension:popup', { stdio: 'inherit' });
  console.log('✅ Extension scripts bundled successfully');
} catch (error) {
  console.error('❌ Failed to bundle extension scripts:', error.message);
  process.exit(1);
}

// Copy extension files
console.log('📁 Copying extension files...');
const filesToCopy = [
  'manifest.json',
  'background/background.js',
  'content/content.bundle.js',
  'content/content.css',
  'popup/popup.html',
  'popup/popup.bundle.js',
  'popup/popup.css',
  'icons/icon16.png',
  'icons/icon48.png',
  'icons/icon128.png'
];

filesToCopy.forEach(file => {
  const srcPath = path.join(extensionDir, file);
  const destPath = path.join(buildDir, file);
  const destDir = path.dirname(destPath);
  
  if (fs.existsSync(srcPath)) {
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(srcPath, destPath);
    console.log(`  ✓ Copied ${file}`);
  } else {
    console.warn(`  ⚠️  File not found: ${file}`);
  }
});

// Update manifest for production
console.log('🔧 Updating manifest for production...');
const manifestPath = path.join(buildDir, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// Remove localhost permission if it exists
if (manifest.host_permissions) {
  manifest.host_permissions = manifest.host_permissions.filter(
    perm => !perm.includes('localhost')
  );
}

// Preserve the version from source manifest; do not override here

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log('✅ Manifest updated for production');

// Create ZIP file
console.log('📦 Creating ZIP package...');
try {
  const zipCommand = process.platform === 'win32' 
    ? `powershell Compress-Archive -Path "${buildDir}\\*" -DestinationPath "tweetreply-extension-v${manifest.version}.zip" -Force`
    : `cd ${buildDir} && zip -r ../tweetreply-extension-v${manifest.version}.zip .`;
  
  execSync(zipCommand, { stdio: 'inherit' });
  console.log(`✅ Extension packaged as tweetreply-extension-v${manifest.version}.zip`);
} catch (error) {
  console.error('❌ Failed to create ZIP package:', error.message);
  process.exit(1);
}

// Display build summary
console.log('\n🎉 Extension build completed successfully!');
console.log(`📦 Package: tweetreply-extension-v${manifest.version}.zip`);
console.log(`📁 Build directory: ${buildDir}`);
console.log('\n📋 Next steps:');
console.log('1. Load the extension in Chrome for testing:');
console.log(`   - Go to chrome://extensions/`);
console.log(`   - Enable "Developer mode"`);
console.log(`   - Click "Load unpacked"`);
console.log(`   - Select the "${buildDir}" folder`);
console.log('2. Test all functionality');
console.log('3. Submit to Chrome Web Store when ready');

// Check file sizes
const zipStats = fs.statSync(`tweetreply-extension-v${manifest.version}.zip`);
const zipSizeMB = (zipStats.size / (1024 * 1024)).toFixed(2);
console.log(`\n📊 Package size: ${zipSizeMB}MB (limit: 100MB)`);

if (zipStats.size > 100 * 1024 * 1024) {
  console.warn('⚠️  Package size exceeds 100MB limit!');
} else {
  console.log('✅ Package size is within limits');
}
