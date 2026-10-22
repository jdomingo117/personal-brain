// Standalone design review: fictional, local data; no auth or data providers.
import { createRoot } from 'react-dom/client'
import './index.css'
import BudgetConcept from './concept/budget/BudgetConcept'

createRoot(document.getElementById('root')!).render(<BudgetConcept />)
