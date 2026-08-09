/**
 * Architectural guard: browser code may read through PostgREST, but every
 * Halcyon application-data mutation must traverse an Edge Function. Supabase
 * Auth is deliberately outside this check: it owns identity/session lifecycle
 * rather than an application table.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const SOURCE_ROOT = join(process.cwd(), 'src')
const MUTATORS = new Set(['insert', 'update', 'upsert', 'delete'])

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.test.ts') ? [path] : []
  })
}

function isSupabaseFromChain(node: ts.Expression): boolean {
  if (ts.isPropertyAccessExpression(node)) return isSupabaseFromChain(node.expression)
  if (!ts.isCallExpression(node)) return false
  if (
    ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === 'from'
    && ts.isIdentifier(node.expression.expression)
    && node.expression.expression.text === 'supabase'
  ) return true
  return isSupabaseFromChain(node.expression)
}

function forbiddenCalls(text: string, fileName = 'fixture.ts'): string[] {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true)
  const violations: string[] = []
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text
      const receiver = node.expression.expression
      const isDirectRpc = method === 'rpc'
        && ts.isIdentifier(receiver)
        && receiver.text === 'supabase'
      if ((MUTATORS.has(method) && isSupabaseFromChain(receiver)) || isDirectRpc) {
        const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source))
        violations.push(`${fileName}:${line + 1}:${character + 1} ${method}`)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return violations
}

describe('frontend database-write boundary', () => {
  it('allows RLS reads, Edge Function calls, and Supabase Auth operations', () => {
    expect(forbiddenCalls(`
      supabase.from('accounts').select('*')
      supabase.functions.invoke('upsert-account', { body: {} })
      supabase.auth.signOut()
    `)).toEqual([])
  })

  it('detects direct PostgREST mutations and RPC calls', () => {
    expect(forbiddenCalls(`
      supabase.from('accounts').update({ name: 'nope' }).eq('id', 'x')
      supabase.from('accounts').insert({ name: 'nope' })
      supabase.rpc('replace_transfer_links', {})
    `)).toEqual([
      'fixture.ts:2:7 update',
      'fixture.ts:3:7 insert',
      'fixture.ts:4:7 rpc',
    ])
  })

  it('contains no forbidden database write path in application source', () => {
    const violations = sourceFiles(SOURCE_ROOT).flatMap((path) =>
      forbiddenCalls(readFileSync(path, 'utf8'), path.replace(`${process.cwd()}/`, '')),
    )
    expect(violations).toEqual([])
  })
})
