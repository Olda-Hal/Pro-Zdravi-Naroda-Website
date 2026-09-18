import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const allowedHosts = [
    'localhost',
    '127.0.0.1',
    'prozdravinaroda.cz',
    'www.prozdravinaroda.cz',
    ...((env.VITE_ALLOWED_HOSTS ?? '').split(',').map((host) => host.trim()).filter(Boolean)),
  ]

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      allowedHosts,
    },
    preview: {
      host: '0.0.0.0',
      port: 4173,
      allowedHosts,
    },
  }
})
