import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const component = readFileSync(new URL('./AllocationDonut.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')

describe('AllocationDonut compact layout', () => {
  it('uses a container query to stack the fixed-size donut above its full-width legend', () => {
    expect(component).toContain('allocation-donut__layout')
    expect(component).toContain('allocation-donut__visual')
    expect(component).toContain('allocation-donut__legend')
    expect(css).toContain('.allocation-donut { container-type: inline-size; }')
    expect(css).toContain('@container (max-width: 420px)')
    expect(css).toContain('flex-direction: column;')
    expect(css).toContain('.allocation-donut__legend { flex: none; width: 100%; }')
  })
})
