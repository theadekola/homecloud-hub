import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
 plugins:[react()],
 build:{rollupOptions:{output:{manualChunks(id){if(id.endsWith('/bundled-icon-images.ts'))return 'system-icons';}}}},
 server:{proxy:{'/api':{target:process.env.ICLUSTERS_DEV_API_URL||process.env.HOMECLOUD_DEV_API_URL||'http://127.0.0.1:6000',changeOrigin:true}}}
});
