import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./CardBackdrop.tsx', import.meta.url), 'utf8');

const css = readFileSync(new URL('../styles/screen.css', import.meta.url), 'utf8');

assert.match(source, /aria-hidden="true"/);
assert.equal((source.match(/^  \['/gm) ?? []).length, 9);
assert.match(source, /back-dual-face\.webp/);
assert.match(source, /intrigue-plot\.webp/);
assert.match(source, /card-backdrop--hidden/);

const opening = readFileSync(new URL('./OpeningSequence.tsx', import.meta.url), 'utf8');
assert.match(opening, /<CardBackdrop/);

const tokens = readFileSync(new URL('../motion/tokens.ts', import.meta.url), 'utf8');
assert.match(tokens, /cover:\s*2/);
const cssTokens = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
assert.match(cssTokens, /--dur-cover:\s*2000ms/);

// Card aspect ratio is 2 / 3
assert.match(css, /\.card-backdrop__card\s*\{[^}]*aspect-ratio:\s*2\s*\/\s*3;/s);
// Cards are opaque (opacity: 1)
assert.match(css, /\.card-backdrop__card\s*\{[^}]*opacity:\s*1;/s);

console.log('CardBackdrop.check.ts passed.');
