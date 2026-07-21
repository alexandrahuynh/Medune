import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'

// Inside Docker (VITE_USE_POLLING=true) bind all interfaces so the published
// port is reachable, and poll the filesystem so HMR works across the bind mount
// on macOS/Windows. Outside Docker this block is a no-op.
const usePolling = process.env.VITE_USE_POLLING === 'true'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: usePolling ? { host: true, watch: { usePolling: true } } : undefined,
})
