import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    server: { port: 5174 },
    // Served by apitester-mule's static-resource listener at path="/ui/*" (collections-api.xml),
    // not at the root — asset references in the built index.html need the matching /ui/ prefix
    // or they'd request /assets/... at the root, where nothing is listening anymore.
    base: '/ui/',
});
