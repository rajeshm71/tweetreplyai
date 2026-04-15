# Extension build

Run from project root:

1. **Verify manifest references**
   ```bash
   npm run verify:extension
   ```

2. **Build extension bundles**
   ```bash
   npm run build:extension
   ```

3. **Package to `extension-build`**
   ```bash
   npm run package:extension
   ```

Legacy manual copy command (optional) (PowerShell on Windows):
   ```powershell
   New-Item -ItemType Directory -Force -Path extension-build\background, extension-build\content, extension-build\popup, extension-build\icons | Out-Null; Copy-Item extension\manifest.json extension-build\; Copy-Item extension\background\background.js extension-build\background\; Copy-Item extension\content\content.bundle.js, extension\content\content.css extension-build\content\; Copy-Item extension\popup\popup.html, extension\popup\popup.bundle.js, extension\popup\popup.css extension-build\popup\; Copy-Item extension\icons\icon16.png, extension\icons\icon48.png, extension\icons\icon128.png extension-build\icons\
   ```

   On macOS/Linux (bash):
   ```bash
   mkdir -p extension-build/background extension-build/content extension-build/popup extension-build/icons && cp extension/manifest.json extension-build/ && cp extension/background/background.js extension-build/background/ && cp extension/content/content.bundle.js extension/content/content.css extension-build/content/ && cp extension/popup/popup.html extension/popup/popup.bundle.js extension/popup/popup.css extension-build/popup/ && cp extension/icons/icon16.png extension/icons/icon48.png extension/icons/icon128.png extension-build/icons/
   ```

Load the extension in Chrome from the `extension-build` folder.
