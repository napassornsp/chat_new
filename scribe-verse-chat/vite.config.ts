// vite.config.ts
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const OFFLINE = env.VITE_OFFLINE === '1'

  return {
    plugins: [react()],
    resolve: {
      alias: {
        // allow imports like "@/components/..."
        '@': path.resolve(__dirname, './src'),
        // when offline, redirect @supabase/* to our shim
        ...(OFFLINE
          ? {
              '@supabase/supabase-js': path.resolve(
                __dirname,
                './src/lib/offline/supabaseShim.ts'
              ),
            }
          : {}),
      },
    },
  }
})
