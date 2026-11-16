// Run questions through api/ask locally (or against a live URL) and grade them.
// Usage: node evals/run_ask.mjs [baseUrl]   (no baseUrl = call the function in-process)
// Key: OPENROUTER_API_KEY env, or KEY_ENV_FILE pointing at an env file. Never printed.
import fs from 'node:fs';
import { grade } from './grade.mjs';

const base = process.argv[2];
if (!process.env.OPENROUTER_API_KEY && process.env.KEY_ENV_FILE) {
  const line = fs.readFileSync(process.env.KEY_ENV_FILE, 'utf8').split(/\r?\n/).find((l) => l.startsWith('OPENROUTER_API_KEY='));
  if (line) process.env.OPENROUTER_API_KEY = line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
}
const { POST } = base ? {} : await import('../api/ask.mjs');
const only = process.env.ONLY ? Number(process.env.ONLY) : Infinity;
// SKIP lets a live run go in batches that stay under the hourly limit per address.
const skip = process.env.SKIP ? Number(process.env.SKIP) : 0;
const qs = JSON.parse(fs.readFileSync(new URL('./questions.json', import.meta.url), 'utf8')).filter((question) => !process.env.MATCH || new RegExp(process.env.MATCH, 'i').test(question.q)).slice(skip, skip + only);

async function ask(q) {
  const t0 = Date.now();
  const res = base
    ? await fetch(`${base}/api/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q }) })
    : await POST(new Request('http://local/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `eval-${Math.random()}` }, body: JSON.stringify({ q }) }));
  const raw = await res.text();
  let meta = null, text = '', complete = false;
  const errors = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const j = JSON.parse(line);
    if (j.meta) meta = j.meta;
    if (j.t) text += j.t;
    if (j.error) errors.push(j.error);
    if (j.done) complete = true;
  }
  return { status: res.status, meta, text, complete, errors, ms: Date.now() - t0 };
}

let pass = 0, total = 0;
const tally = {};
for (const x of qs) {
  const r = await ask(x.q);
  const { checks, invented } = grade(x, r);
  const ok = Object.values(checks).every(Boolean);
  pass += ok; total++;
  for (const [k, v] of Object.entries(checks)) { tally[k] ??= [0, 0]; tally[k][0] += v; tally[k][1]++; }
  console.log(`${ok ? 'PASS' : 'FAIL'} ${x.kind.padEnd(12)} ${x.q.slice(0, 60).padEnd(60)} topic=${r.meta?.topic} model=${r.meta?.model} ${r.ms}ms`);
  if (!ok || process.env.SHOW) console.log('   checks', JSON.stringify(checks), invented.length ? `invented=${invented}` : '', '\n   >', r.text.replace(/\s+/g, ' ').slice(0, process.env.SHOW ? Infinity : 400));
}
console.log(`\n${pass}/${total} passed`);
for (const [k, [a, b]] of Object.entries(tally)) console.log(`  ${k}: ${a}/${b}`);
if (pass !== total) process.exitCode = 1;
