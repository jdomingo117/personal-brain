#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoDir = resolve(appDir, '..')
const childEnv = {
  ...process.env,
  NPM_CONFIG_CACHE: process.env.NPM_CONFIG_CACHE ?? resolve(tmpdir(), 'fin-app-npm-cache'),
}

if (!childEnv.SUPABASE_ANON_KEY || !childEnv.SUPABASE_SERVICE_ROLE_KEY) {
  const status = spawnSync('npx', ['supabase', 'status', '-o', 'env'], {
    cwd: repoDir, env: childEnv, encoding: 'utf8', shell: process.platform === 'win32',
  })
  if (status.status !== 0) {
    console.error('The local Supabase stack is required. Start it before running browser tests.')
    process.exit(status.status ?? 1)
  }
  for (const line of status.stdout.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)="(.*)"$/)
    if (match) childEnv[match[1]] = match[2]
  }
  childEnv.SUPABASE_URL ??= childEnv.API_URL
  childEnv.SUPABASE_ANON_KEY ??= childEnv.ANON_KEY
  childEnv.SUPABASE_SERVICE_ROLE_KEY ??= childEnv.SERVICE_ROLE_KEY
}

if (!childEnv.SUPABASE_ANON_KEY || !childEnv.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Could not resolve local Supabase test credentials.')
  process.exit(1)
}

const run = spawnSync('npx', ['playwright', 'test', ...process.argv.slice(2)], {
  cwd: appDir, env: childEnv, stdio: 'inherit', shell: process.platform === 'win32',
})
process.exit(run.status ?? 1)
