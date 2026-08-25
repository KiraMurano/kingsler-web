import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./ProfileDialog.tsx', import.meta.url), 'utf8');

assert.match(source, /PROFILE_AVATARS\.map/);
assert.match(source, /PROFILE_TITLES\.map/);
assert.match(source, /aria-pressed=/);
assert.match(source, /updateProfile/);

console.log('ProfileDialog.check.ts passed.');
