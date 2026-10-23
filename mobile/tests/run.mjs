// Runs every tests/*.test.ts against a real in-memory SQLite (Node's built-in node:sqlite), with Expo
// modules swapped for tiny stand-ins (tests/shims). Each test prints "ok" / "FAIL" lines.
// Usage: npm test            (all)
//        npm test -- hat sync (only files whose name contains one of the words)
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const only = process.argv.slice(2);
const files = readdirSync(here)
  .filter((f) => f.endsWith('.test.ts') && (!only.length || only.some((w) => f.includes(w))))
  .sort();

let failed = 0;
let checks = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, ['--no-warnings', '--import', 'tsx', join(here, f)], {
    cwd: join(here, '..'),
    env: { ...process.env, TSX_TSCONFIG_PATH: join(here, 'tsconfig.json') },
    encoding: 'utf8',
  });
  const out = `${r.stdout}${r.stderr}`;
  const lines = out.split('\n').filter((l) => /^(ok|FAIL)\b/.test(l));
  const bad = lines.filter((l) => l.startsWith('FAIL'));
  const crashed = r.status !== 0 || /\bError\b/.test(r.stderr);
  checks += lines.length;
  if (bad.length || crashed || !lines.length) {
    failed += 1;
    console.log(`✗ ${f}`);
    for (const l of bad) console.log(`    ${l.slice(0, 300)}`);
    if (crashed || !lines.length) console.log(out.split('\n').slice(0, 12).map((l) => `    ${l}`).join('\n'));
  } else {
    console.log(`✓ ${f} (${lines.length})`);
  }
}
console.log(`\n${files.length - failed}/${files.length} files passed, ${checks} checks.`);
process.exit(failed ? 1 : 0);
