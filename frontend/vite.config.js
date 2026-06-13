import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Multi-page build: every HTML page is an entry. The Cloudflare Pages
// Functions in ./functions are NOT part of this build — Pages bundles them
// itself from the project root; Vite only produces the static site in dist/.
export default defineConfig({
    build: {
        outDir: 'dist',
        rollupOptions: {
            input: {
                index: fileURLToPath(new URL('./index.html', import.meta.url)),
                analysis: fileURLToPath(new URL('./analysis.html', import.meta.url)),
                dashboard: fileURLToPath(new URL('./dashboard.html', import.meta.url)),
                login: fileURLToPath(new URL('./login.html', import.meta.url)),
                register: fileURLToPath(new URL('./register.html', import.meta.url)),
            },
        },
    },
    server: {
        // Local dev against local functions: run `npx wrangler pages dev dist`
        // (or against production by changing the target)
        proxy: {
            '/api': 'http://localhost:8788',
        },
    },
});
