import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
 plugins:[react()],
 server:{proxy:{'/api':{target:process.env.HOMECLOUD_DEV_API_URL||'http://127.0.0.1:6000',changeOrigin:true}}}
});
