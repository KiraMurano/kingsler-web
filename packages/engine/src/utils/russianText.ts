// Russian grammatical inflection helpers for player names and game events

/**
 * Склоняется только кириллица.
 *
 * Ники живых игроков бывают какими угодно — латиницей, цифрами, вперемешку, —
 * и правил для них нет. Слово без кириллических букв возвращается как есть.
 */
function isCyrillic(word: string): boolean {
  return /[а-яё]/i.test(word);
}

/** Винительный падеж одного слова. */
function accWord(word: string): string {
  if (word.endsWith('а')) return word.slice(0, -1) + 'у';
  if (word.endsWith('я')) return word.slice(0, -1) + 'ю';
  if (word.endsWith('й')) return word.slice(0, -1) + 'я';
  if (word.endsWith('ь')) return word.slice(0, -1) + 'я';
  if (!word.endsWith('о') && !word.endsWith('е') && !word.endsWith('и')) return word + 'а';
  return word;
}

/** Родительный падеж одного слова. */
function genWord(word: string): string {
  if (word.endsWith('а')) return word.slice(0, -1) + 'ы';
  if (word.endsWith('я')) return word.slice(0, -1) + 'и';
  if (word.endsWith('й')) return word.slice(0, -1) + 'я';
  if (word.endsWith('ь')) return word.slice(0, -1) + 'я';
  if (!word.endsWith('о') && !word.endsWith('е') && !word.endsWith('и')) return word + 'а';
  return word;
}

/**
 * Склоняется КАЖДОЕ слово, а не только последнее.
 *
 * Имена ботов двусоставные — «Барон Дима», «Графиня Елена», — и титул склоняется
 * вместе с именем: «на Барона Диму», а не «на Барон Диму».
 */
function inflect(name: string, word: (w: string) => string): string {
  return name
    .split(' ')
    .map(w => (isCyrillic(w) ? word(w) : w))
    .join(' ');
}

export function declineAcc(name: string): string {
  if (name === 'Вы' || name === 'вы') return 'вас';
  return inflect(name, accWord);
}

export function declineGen(name: string): string {
  if (name === 'Вы' || name === 'вы') return 'вас';
  return inflect(name, genWord);
}

/** Всё, что нужно знать о говорящем, чтобы решить, склонять ли его имя. */
export interface Named {
  name: string;
  isBot: boolean;
}

/**
 * Винительный падеж имени за столом.
 *
 * У ботов имена придуманы нами и склоняются. У живых игроков это ники — их
 * оставляем как есть: склонять чужой ник значит его коверкать.
 */
export function accOf(who: Named): string {
  return who.isBot ? declineAcc(who.name) : who.name;
}

/** Родительный падеж имени за столом. Правило то же — см. `accOf`. */
export function genOf(who: Named): string {
  return who.isBot ? declineGen(who.name) : who.name;
}

/**
 * Женские имена за нашим столом.
 *
 * Род брался по окончанию всей строки, а строка — это полное имя с титулом.
 * «Барон Дима» кончается на «а», и в хронике выходило «Барон Дима усомнилась»;
 * приписки `name === 'Елена'` не спасали, потому что полное имя никогда не
 * равно короткому. Имена ботов придуманы нами и конечны, поэтому род задаётся
 * списком, а не угадывается.
 *
 * Ники живых игроков — латиница (см. NICKNAME_REGEX в profile.ts), под правило
 * они не попадают и остаются в мужском роде, как и до этого.
 */
const FEMININE_NAMES = new Set(['Елена', 'Анна', 'Ждана']);

function isFeminine(name: string): boolean {
  const firstName = name.trim().split(' ').pop() ?? name;
  return FEMININE_NAMES.has(firstName);
}

export function verbDoubted(name: string): string {
  return isFeminine(name) ? 'усомнилась' : 'усомнился';
}

export function verbCaught(name: string): string {
  return isFeminine(name) ? 'поймала' : 'поймал';
}

export function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
