/* Dev-only entry for the concept page (vite serves /concept.html). Not part of
   the app build — delete this, concept.html and src/concept/ once an option is
   chosen and folded into src/components/. */
import { createRoot } from 'react-dom/client'
import './index.css'
import ConceptPage from './concept/ConceptPage'

createRoot(document.getElementById('root')!).render(<ConceptPage />)
