import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const auto = readFileSync(new URL('./AutoHeight.tsx', import.meta.url), 'utf8');
const bar = readFileSync(new URL('../ActionBar.tsx', import.meta.url), 'utf8');
const phase = readFileSync(new URL('../PhasePanel.tsx', import.meta.url), 'utf8');

assert.match(auto, /ResizeObserver/);
assert.match(auto, /Math\.round\(el\.offsetHeight\)/);
assert.match(auto, /animate=\{reduce \|\| height === null \? undefined : \{ height \}\}/);

assert.match(bar, /mode="popLayout"/);
assert.equal(bar.includes('mode="wait"'), false);
assert.match(bar, /<AutoHeight/);

assert.match(phase, /mode="popLayout"/);
assert.equal(phase.includes('mode="wait"'), false);
assert.match(phase, /<AutoHeight/);
assert.equal(phase.includes('layout="size"') || phase.includes("layout='size'"), false);

console.log('AutoHeight.check.ts passed.');
