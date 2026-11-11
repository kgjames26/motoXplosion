// Increments the game version (public/version.json) and the offline cache name (public/sw.js).
// Run automatically on every new user request by the UserPromptSubmit hook (.claude/settings.json),
// or manually: node tools/bump-version.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'public', 'version.json');
let data = { version: '2.0', build: 0 };
try {
  data = JSON.parse(readFileSync(file, 'utf8'));
} catch {}
data.build = (Number(data.build) || 0) + 1;
data.version = `2.${data.build}`;
writeFileSync(file, JSON.stringify(data) + '\n');

try {
  const swFile = join(root, 'public', 'sw.js');
  const sw = readFileSync(swFile, 'utf8');
  writeFileSync(swFile, sw.replace(/const CACHE = '[^']*';/, `const CACHE = 'motoxplosion-v${data.build}';`));
} catch {}
console.log('version', data.version);
