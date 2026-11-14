import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { parseEnv } from 'node:util'
import { fileURLToPath } from 'node:url'

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(clientRoot, '..')

function readViteEnv(directory) {
  const env = {}
  for (const name of ['.env', '.env.local', '.env.development', '.env.development.local']) {
    const file = path.join(directory, name)
    if (existsSync(file)) Object.assign(env, parseEnv(readFileSync(file, 'utf8')))
  }
  return env
}

const clientEnv = readViteEnv(clientRoot)
const serverEnv = readViteEnv(path.join(repoRoot, 'server'))
const selectedAppEnv = String(
  process.env.APP_ENV ?? clientEnv.APP_ENV ?? serverEnv.APP_ENV ?? 'development',
).trim().toLowerCase()
const appEnv = selectedAppEnv === 'test' ? 'test' : 'development'
const childEnv = { ...process.env, APP_ENV: appEnv }
const windows = process.platform === 'win32'
const npm = windows ? 'npm.cmd' : 'npm'
const viteCli = path.join(clientRoot, 'node_modules', 'vite', 'bin', 'vite.js')
const children = []
let stopping = false

function stopChild(child) {
  if (!child.pid || child.exitCode !== null) return
  if (windows) {
    const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    })
    killer.on('error', () => child.kill('SIGTERM'))
    return
  }
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
}

function stopAll(exitCode = 0) {
  if (stopping) {
    if (exitCode !== 0) process.exitCode = exitCode
    return
  }
  stopping = true
  process.exitCode = exitCode
  for (const child of children) stopChild(child)
  setTimeout(() => process.exit(process.exitCode ?? exitCode), 5000).unref()
}

function start(label, command, args, cwd) {
  const child = spawn(command, args, {
    cwd,
    env: childEnv,
    stdio: 'inherit',
    windowsHide: true,
    shell: windows && command.toLowerCase().endsWith('.cmd'),
    detached: !windows,
  })
  children.push(child)
  child.once('error', (error) => {
    console.error(`[dev] Could not start ${label}: ${error.message}`)
    stopAll(1)
  })
  child.once('exit', (code, signal) => {
    if (stopping) return
    console.error(`[dev] ${label} stopped${signal ? ` (${signal})` : ` (exit ${code})`}; stopping all apps.`)
    stopAll(code ?? 1)
  })
}

if (!existsSync(viteCli)) {
  console.error('[dev] Vite is not installed in client/. Run npm install in client/ first.')
  process.exit(1)
}

console.log(`[dev] Starting Zamil Digitalization, TrainingHub and ExpenseHub (APP_ENV=${appEnv}).`)
console.log('[dev] Zamil :7382 · TrainingHub :7384 · ExpenseHub :7386 · Ctrl+C stops all three.')

start('Zamil web', process.execPath, [viteCli], clientRoot)
start('TrainingHub', npm, ['run', 'dev'], path.join(repoRoot, 'traininghub'))
start('ExpenseHub', npm, ['run', 'dev'], path.join(repoRoot, 'expensehub'))

process.on('SIGINT', () => stopAll(0))
process.on('SIGTERM', () => stopAll(0))
