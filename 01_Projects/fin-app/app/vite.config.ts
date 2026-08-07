import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // @xyflow/react (Expenses flow) needs a single React copy, else its hooks hit
  // the "multiple copies of React" invalid-hook error.
  resolve: { dedupe: ['react', 'react-dom'] },
  server: { port: 5300, strictPort: true, host: true },
})
