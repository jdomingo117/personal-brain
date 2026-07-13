import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // the concept page pulls in @xyflow/react + nivo; force a single React copy so
  // their hooks don't hit the "multiple copies of React" invalid-hook error.
  resolve: { dedupe: ['react', 'react-dom'] },
  server: { port: 5300, strictPort: true, host: true },
})
