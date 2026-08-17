#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { assertSafeTestTarget } from './lib/assertSafeTestTarget.mjs'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoDir = resolve(appDir, '..')
const childEnv = {
  ...process.env,
  NPM_CONFIG_CACHE: process.env.NPM_CONFIG_CACHE ?? resolve(tmpdir(), 'fin-app-npm-cache'),
}

try {
  assertSafeTestTarget(childEnv)
} catch (error) {
  console.error(error.message)
  process.exit(1)
}

if (!childEnv.SUPABASE_ANON_KEY || !childEnv.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Set explicit credentials for the isolated Supabase test target.')
  process.exit(1)
}

const run = spawnSync('npx', ['playwright', 'test', ...process.argv.slice(2)], {
  cwd: appDir, env: childEnv, stdio: 'inherit', shell: process.platform === 'win32',
})
process.exit(run.status ?? 1)
