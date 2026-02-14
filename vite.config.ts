import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  // Web SPA needs absolute asset paths for hard refreshes on nested routes.
  // Electron file:// builds need relative paths to load local assets.
  base: mode === 'electron' ? './' : '/',
}))
