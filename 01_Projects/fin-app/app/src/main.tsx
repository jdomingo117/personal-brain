import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// No StrictMode: it double-invokes effects in dev, which would create two
// WebGL contexts on the scene canvas.
createRoot(document.getElementById('root')!).render(<App />)
