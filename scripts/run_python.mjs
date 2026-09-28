// Runs each Python file passed as an argument, stopping at the first failure,
// the way the chain of `&&` in `npm run test:python` used to.
//
// It exists because the interpreter is not called the same thing everywhere.
// `python3` is correct on macOS and Linux and is what the pipeline commands in
// CLAUDE.md use, but a stock Windows install ships no `python3` at all: the
// name is taken by an App Execution Alias that prints "Python was not found"
// and exits non-zero, so `npm run check` failed on a clean Windows checkout
// with seven passing test files sitting right there. Probing is the only
// honest answer — the alias looks exactly like a real interpreter until it
// runs.
import { spawnSync } from 'node:child_process'

const CANDIDATES = [
  ['python3', []],
  ['py', ['-3']],
  ['python', []],
]

function resolveInterpreter() {
  for (const [command, prefix] of CANDIDATES) {
    const probe = spawnSync(command, [...prefix, '--version'], {
      encoding: 'utf8',
    })
    // The Store alias exits non-zero and prints to stderr, so a zero exit with
    // "Python 3" on either stream is what separates it from the real thing.
    if (probe.status !== 0) continue
    if (!/^Python 3\./m.test(`${probe.stdout ?? ''}${probe.stderr ?? ''}`)) continue
    return [command, prefix]
  }
  return null
}

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('run_python.mjs: no files given')
  process.exit(2)
}

const interpreter = resolveInterpreter()
if (!interpreter) {
  console.error(
    'No Python 3 interpreter found. Tried: ' +
      CANDIDATES.map(([c, p]) => [c, ...p].join(' ')).join(', ') +
      '\nInstall Python 3 and make sure it is on PATH.',
  )
  process.exit(1)
}

const [command, prefix] = interpreter
for (const file of files) {
  const run = spawnSync(command, [...prefix, file], {
    stdio: 'inherit',
  })
  if (run.status !== 0) process.exit(run.status ?? 1)
}
