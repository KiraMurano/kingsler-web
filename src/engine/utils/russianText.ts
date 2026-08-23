// Russian grammatical inflection helpers for player names and game events

export function declineAcc(name: string): string {
  if (name === 'Вы' || name === 'вы') return 'вас';
  if (name.endsWith('а')) return name.slice(0, -1) + 'у';
  if (name.endsWith('я')) return name.slice(0, -1) + 'ю';
  if (name.endsWith('й')) return name.slice(0, -1) + 'я';
  if (name.endsWith('ь')) return name.slice(0, -1) + 'я';
  if (!name.endsWith('о') && !name.endsWith('е') && !name.endsWith('и')) return name + 'а';
  return name;
}

export function declineGen(name: string): string {
  if (name === 'Вы' || name === 'вы') return 'вас';
  if (name.endsWith('а')) return name.slice(0, -1) + 'ы';
  if (name.endsWith('я')) return name.slice(0, -1) + 'и';
  if (name.endsWith('й')) return name.slice(0, -1) + 'я';
  if (name.endsWith('ь')) return name.slice(0, -1) + 'я';
  if (!name.endsWith('о') && !name.endsWith('е') && !name.endsWith('и')) return name + 'а';
  return name;
}

export function verbDoubted(name: string): string {
  if (name === 'Елена' || name === 'Анна' || name.endsWith('а') || name.endsWith('я')) {
    return 'усомнилась';
  }
  return 'усомнился';
}

export function verbCaught(name: string): string {
  if (name === 'Елена' || name === 'Анна' || name.endsWith('а') || name.endsWith('я')) {
    return 'поймала';
  }
  return 'поймал';
}

export function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
