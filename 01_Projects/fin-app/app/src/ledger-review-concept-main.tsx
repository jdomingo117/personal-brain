// Standalone, development-only design review. No app providers or real data.
import { createRoot } from 'react-dom/client'
import './index.css'
import LedgerReviewConcept from './concept/LedgerWorkspaceConcept'

createRoot(document.getElementById('root')!).render(<LedgerReviewConcept />)
