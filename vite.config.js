import { defineConfig } from 'vite';
export default defineConfig({ base:'./', server:{host:'0.0.0.0', allowedHosts:true, proxy:{'/api':'http://127.0.0.1:3001','/uploads':'http://127.0.0.1:3001'}}, build:{outDir:'dist'} });
