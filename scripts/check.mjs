/**
 * Прогон всех самопроверок — параллельно.
 *
 * Проверок за полсотни, каждая живёт своим процессом, и почти вся их
 * длительность — это ожидание таймеров движка, а не работа процессора. Подряд
 * они шли около пяти минут, из которых больше минуты уходило на один только
 * запуск `tsx` пятьдесят раз. Параллельно то же самое укладывается в минуту.
 *
 * Файлы `*.soak.ts` сюда не входят: они играют полную партию в реальном
 * времени и идут минутами. Их гоняют отдельно и осознанно —
 * `npx tsx packages/engine/src/bot/botIntrigues.soak.ts`.
 *
 * Порядок вывода — по имени файла, а не по тому, кто первым закончил: список
 * должен быть одинаковым от прогона к прогону, иначе его нельзя сравнивать
 * глазами.
 *
 * Run: npm run check
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';

const ROOTS = ['packages/engine/src', 'apps/web/src', 'apps/server/src'];

/** Сколько проверок держим в воздухе разом. */
const LANES = Math.max(4, Math.min(12, cpus().length));

async function collect(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await collect(path)));
    else if (entry.name.endsWith('.check.ts')) found.push(path);
  }
  return found;
}

function run(file) {
  return new Promise(resolve => {
    const started = Date.now();
    const child = spawn('npx', ['tsx', file], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', d => (out += d));
    child.stderr.on('data', d => (out += d));
    child.on('close', code =>
      resolve({ file, code, out, ms: Date.now() - started })
    );
  });
}

const files = (await Promise.all(ROOTS.map(collect))).flat().sort();
const results = new Map();
let next = 0;

await Promise.all(
  Array.from({ length: LANES }, async () => {
    while (next < files.length) {
      const file = files[next++];
      results.set(file, await run(file));
    }
  })
);

let failed = 0;
for (const file of files) {
  const r = results.get(file);
  if (r.code === 0) continue;
  failed++;
  console.log(`\nFAILED (${(r.ms / 1000).toFixed(1)}s): ${file}`);
  console.log(r.out.trimEnd().split('\n').slice(-20).join('\n'));
}

const slowest = files
  .map(f => results.get(f))
  .sort((a, b) => b.ms - a.ms)
  .slice(0, 3)
  .map(r => `${r.file.split('/').pop()} ${(r.ms / 1000).toFixed(0)}s`)
  .join(', ');

console.log(
  failed === 0
    ? `\nALL CHECKS OK — ${files.length} шт. Дольше всех: ${slowest}`
    : `\n${failed} из ${files.length} проверок красные.`
);
process.exit(failed === 0 ? 0 : 1);
