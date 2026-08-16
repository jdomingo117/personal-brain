/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // @xyflow/react (Expenses flow) needs a single React copy, else its hooks hit
  // the "multiple copies of React" invalid-hook error.
  resolve: { dedupe: ['react', 'react-dom'] },
  server: { port: 5300, strictPort: true, host: true },
  // Playwright owns real-browser cases under e2e/; keep Vitest's fast unit
  // runner from trying to execute Playwright's fixture declarations.
  test: { exclude: ['e2e/**', '**/node_modules/**', '**/.git/**'] },
})
