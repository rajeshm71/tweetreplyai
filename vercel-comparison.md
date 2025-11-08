# Vercel.json Comparison: Commit 82e1878 vs Current

## Current Version (HEAD)

```json
{
  "version": 2,
  "buildCommand": "npm run vercel-build",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ],
  "env": {
    "NODE_ENV": "production"
  }
}
```

## Commit 82e1878 Version

Based on the partial output observed, the commit version had:

```json
{
  "version": 2,
  "buildCommand": "npm run build",
  "builds": [
    {
      "src": "dist/prod.js",
      "use": "@vercel/node"
    },
    {
      "src": "dist/public/**",
      "use": "@vercel/static"
    }
  ],
  "routes": [
    {
      "src": "/assets/(.*)",
      "dest": "/dist/public/assets/$1"
    },
    {
      "src": "/(.*\\.css)$",
      "dest": "/dist/public/$1"
    },
    {
      "src": "/(.*)",
      "dest": "/dist/prod.js"
    }
  ],
  "env": {
    "NODE_ENV": "production"
  }
}
```

## Key Differences

1. **Build Command**:
   - Commit 82e1878: `"npm run build"`
   - Current: `"npm run vercel-build"`

2. **Configuration Approach**:
   - Commit 82e1878: Uses **builds** and **routes** (Vercel v1 style)
   - Current: Uses **rewrites** (Vercel v2 style, simpler SPA routing)

3. **Routing**:
   - Commit 82e1878: Explicit routing with:
     - `/assets/*` → static files
     - `/*.css` → CSS files
     - Everything else → `dist/prod.js` (Node.js server)
   - Current: Single rewrite rule - all routes → `/index.html` (SPA pattern)

4. **Build Output**:
   - Commit 82e1878: Expects `dist/prod.js` (server) and `dist/public/**` (static)
   - Current: Expects standard SPA build output (likely `dist/` with `index.html`)

## Analysis

The current version appears to be configured for a **Single Page Application (SPA)** deployment, while the commit 82e1878 version was configured for a **Node.js server + static files** deployment pattern.

The current configuration is simpler and more appropriate for a React/Vite SPA, while the commit version suggests a server-side rendering or API server setup.

