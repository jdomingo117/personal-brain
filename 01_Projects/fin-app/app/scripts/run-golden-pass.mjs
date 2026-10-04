#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertSafeTestTarget } from './lib/assertSafeTestTarget.mjs'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoDir = resolve(appDir, '..')
const npmCache = process.env.NPM_CONFIG_CACHE ?? resolve(tmpdir(), 'fin-app-npm-cache')
const projectId = `halcyon-golden-isolated-${Date.now()}`
const workDir = mkdtempSync(resolve(tmpdir(), 'halcyon-golden-'))
const isolatedSupabase = resolve(workDir, 'supabase')
let functions
let stackStarted = false

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoDir,
    env: { ...process.env, NPM_CONFIG_CACHE: npmCache, ...options.env },
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join('\n')
    throw new Error(`${command} ${args.join(' ')} failed${details ? `\n${details}` : ''}`)
  }
  return result.stdout ?? ''
}

function configureIsolatedStack() {
  cpSync(resolve(repoDir, 'supabase'), isolatedSupabase, { recursive: true })
  const configPath = resolve(isolatedSupabase, 'config.toml')
  let config = readFileSync(configPath, 'utf8')
  const replacements = new Map([
    [/project_id = "fin-app"/, `project_id = "${projectId}"`],
    [/port = 54321/, 'port = 55421'],
    [/port = 54322/, 'port = 55422'],
    [/shadow_port = 54320/, 'shadow_port = 55420'],
    [/port = 54323/, 'port = 55423'],
    [/port = 54324/, 'port = 55424'],
    [/smtp_port = 54325/, 'smtp_port = 55425'],
    [/pop3_port = 54326/, 'pop3_port = 55426'],
    [/http:\/\/localhost:5300/g, 'http://localhost:55300'],
    [/http:\/\/127\.0\.0\.1:5300/g, 'http://127.0.0.1:55300'],
  ])
  for (const [pattern, value] of replacements) config = config.replace(pattern, value)
  // The personal local stack owns the CLI's default analytics port (54327).
  // Analytics is not part of the product path under test, so disabling it is
  // both faster and safer than sharing or displacing that container.
  config += '\n[analytics]\nenabled = false\n'
  writeFileSync(configPath, config)

  const functionEnvPath = resolve(isolatedSupabase, '.env.local')
  const functionEnv = readFileSync(functionEnvPath, 'utf8')
  writeFileSync(
    functionEnvPath,
    `${functionEnv.trimEnd()}\nALLOWED_ORIGINS=http://127.0.0.1:55300,http://localhost:55300\n`,
  )
}

function status() {
  return JSON.parse(run('npx', ['supabase', 'status', '--workdir', workDir, '--output', 'json'], { capture: true }))
}

async function waitForFunctions(url) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/functions/v1/analyze-csv`, { method: 'OPTIONS' })
      if (response.status < 500) return
    } catch {}
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500))
  }
  throw new Error('Isolated Edge Functions did not become ready within 60 seconds.')
}

try {
  configureIsolatedStack()
  // Keep ephemeral local credentials out of normal test output. On failure,
  // run() still includes captured diagnostics in the thrown error.
  run('npx', ['supabase', 'start', '--workdir', workDir], { capture: true })
  stackStarted = true
  const stack = status()
  const apiUrl = stack.API_URL
  const env = {
    SUPABASE_URL: apiUrl,
    SUPABASE_ANON_KEY: stack.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: stack.SERVICE_ROLE_KEY,
    VITE_SUPABASE_URL: 'http://127.0.0.1:55300/supabase',
    VITE_SUPABASE_ANON_KEY: stack.ANON_KEY,
    HALCYON_GOLDEN_SUPABASE_TARGET: apiUrl,
    HALCYON_TEST_TARGET_ID: projectId,
    HALCYON_ALLOW_DESTRUCTIVE_TEST_FIXTURES: 'isolated-only',
    HALCYON_GOLDEN_APP_PORT: '55300',
    NPM_CONFIG_CACHE: npmCache,
  }
  assertSafeTestTarget(env)

  functions = spawn('npx', [
    'supabase', 'functions', 'serve', '--workdir', workDir,
    '--env-file', resolve(isolatedSupabase, '.env.local'),
  ], { cwd: repoDir, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
  functions.stdout.on('data', (chunk) => process.stdout.write(`[functions] ${chunk}`))
  functions.stderr.on('data', (chunk) => process.stderr.write(`[functions] ${chunk}`))
  await waitForFunctions(apiUrl)

  run('npx', ['playwright', 'test', '--config', 'playwright.golden.config.ts'], { cwd: appDir, env })
} finally {
  if (functions && !functions.killed) functions.kill('SIGTERM')
  if (stackStarted) {
    try { run('npx', ['supabase', 'stop', '--workdir', workDir, '--no-backup']) } catch (error) {
      console.error(`Could not stop isolated stack: ${error.message}`)
    }
  }
  rmSync(workDir, { recursive: true, force: true })
}
