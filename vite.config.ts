import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { tempChatServerPlugin } from './server/tempchatPlugin.ts';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tempChatServerPlugin()],
});
