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
const suite = process.argv.includes('--gate2') ? 'gate2' : 'golden'
const projectId = `halcyon-${suite}-isolated-${Date.now()}`
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

/**
 * Supabase CLI normally removes this stack as part of `stop --no-backup`.
 * On a few Docker/CLI combinations it returns successfully while Compose
 * containers remain alive, leaving the next isolated run unable to claim its
 * dedicated ports. The generated project label is unique to this process, so
 * this is a deliberately narrow fallback -- it can never select the personal
 * `fin-app` project or another test run.
 */
function removeResidualProjectContainers() {
  if (!/^halcyon-(golden|gate2)-isolated-\d+$/.test(projectId)) {
    throw new Error(`Refusing to remove containers for unexpected project ID: ${projectId}`)
  }
  const listed = spawnSync('docker', [
    'ps', '-aq', '--filter', `label=com.docker.compose.project=${projectId}`,
  ], { encoding: 'utf8' })
  if (listed.status !== 0) {
    console.error('Could not inspect isolated Docker containers after shutdown.')
    return
  }
  const ids = (listed.stdout ?? '').split(/\s+/).filter(Boolean)
  if (ids.length === 0) return
  const removed = spawnSync('docker', ['rm', '-f', ...ids], { encoding: 'utf8' })
  if (removed.status !== 0) {
    console.error(`Could not remove residual isolated containers: ${removed.stderr ?? 'unknown Docker error'}`)
  } else {
    console.log(`Removed ${ids.length} residual containers for ${projectId}.`)
  }
  const remaining = spawnSync('docker', [
    'ps', '-aq', '--filter', `label=com.docker.compose.project=${projectId}`,
  ], { encoding: 'utf8' })
  if (remaining.status !== 0 || (remaining.stdout ?? '').trim()) {
    throw new Error(`Isolated stack cleanup left containers for ${projectId}.`)
  }
}

async function stopFunctions() {
  if (!functions || functions.exitCode !== null || functions.signalCode !== null) return
  const exited = new Promise((resolveExit) => functions.once('exit', resolveExit))
  functions.kill('SIGTERM')
  const stopped = await Promise.race([
    exited.then(() => true),
    new Promise((resolveTimeout) => setTimeout(() => resolveTimeout(false), 10_000)),
  ])
  if (!stopped && functions.exitCode === null && functions.signalCode === null) {
    functions.kill('SIGKILL')
    await exited
  }
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

  if (suite === 'gate2') {
    run('npx', ['vitest', 'run', 'src/lib/csv/gate2Quality.e2e.test.ts'], {
      cwd: appDir,
      env: {
        ...env,
        HALCYON_GATE2: '1',
        HALCYON_GATE2_ORIGIN: 'http://127.0.0.1:55300',
        // Preserve this aggregate quality evidence outside the disposable
        // stack directory. It contains no credentials and is deliberately
        // kept out of the repository; the stack and all fixtures still go
        // away in finally below.
        HALCYON_GATE2_REPORT: process.env.HALCYON_GATE2_REPORT
          ?? resolve(tmpdir(), 'halcyon-gate2-categorization.json'),
      },
    })
  } else {
    run('npx', ['playwright', 'test', '--config', 'playwright.golden.config.ts'], { cwd: appDir, env })
  }
} finally {
  await stopFunctions()
  if (stackStarted) {
    try { run('npx', ['supabase', 'stop', '--workdir', workDir, '--no-backup']) } catch (error) {
      console.error(`Could not stop isolated stack: ${error.message}`)
    } finally {
      removeResidualProjectContainers()
    }
  }
  rmSync(workDir, { recursive: true, force: true })
}
