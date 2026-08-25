import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./CardBackdrop.tsx', import.meta.url), 'utf8');

assert.match(source, /aria-hidden="true"/);
assert.equal((source.match(/^  \['/gm) ?? []).length, 9);
assert.match(source, /back-dual-face\.webp/);
assert.match(source, /intrigue-plot\.webp/);

console.log('CardBackdrop.check.ts passed.');
