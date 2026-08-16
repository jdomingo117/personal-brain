import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(join(process.cwd(), 'src', path), 'utf8')

describe('statement import / transfer-review boundary', () => {
  it('keeps the reconciliation queue off the ingestion page', () => {
    expect(source('views/Ingestion.tsx')).not.toContain("components/OskoLinker")
    expect(source('views/TransferReview.tsx')).toContain("components/OskoLinker")
    expect(source('components/CSVUploader.tsx')).toContain('onReviewTransfers}>Review transfers')
    expect(source('components/InvestmentCSVUploader.tsx')).toContain('onReviewTransfers}>Review transfers')
  })

  it('routes the pending badge to the transfer destination', () => {
    const shell = source('components/Shell.tsx')
    expect(shell).toContain("item.id === 'transfers' ? pendingTransferReview")
    expect(shell).not.toContain("item.id === 'ingestion' ? pendingTransferReview")
  })

  it('registers the dedicated signed-in route', () => {
    expect(source('App.tsx')).toContain('path="/transfers"')
  })
})
