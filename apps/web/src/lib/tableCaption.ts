/**
 * Подпись под тем, что лежит в середине стола, — фразой, а не названием карты.
 *
 * Раньше здесь стояло само название действия: «Просить содержание», «Обыск
 * покоев», «Вор против Елены». Это подпись к кнопке, а не рассказ о ходе: кто
 * ходит — не сказано, а инфинитив звучит как предложение сделать, хотя ход уже
 * сделан. Теперь это предложение с подлежащим: «Барон Дима просит содержание».
 *
 * Глаголы намеренно в настоящем времени: оно в русском не различает род, и
 * подпись одинаково верна и для «Барона Димы», и для «Графини Елены». В
 * прошедшем пришлось бы согласовывать род с именем, а ники живых игроков рода
 * не имеют вовсе.
 *
 * Имена склоняются `accOf`/`genOf` — они склоняют придуманные нами имена ботов
 * и оставляют как есть ники живых игроков: склонять чужой ник значит его
 * коверкать.
 */
import type { Action, InstantType, Player, Role } from '@kinglier/engine/types';
import { accOf, genOf } from '@kinglier/engine/utils/russianText';

type Named = Pick<Player, 'id' | 'name' | 'isBot'>;

/** Кого зовут этим id. `null`, если такого за столом нет. */
function who(players: Named[], id: string | undefined): Named | null {
  if (!id) return null;
  return players.find(p => p.id === id) ?? null;
}

/** Винительный падеж роли: «заявляет Вора», а не «заявляет Вор». */
function roleAcc(role: Role): string {
  return accOf({ name: role, isBot: true });
}

/** Подпись к обычному действию двора. */
function normalCaption(action: Action, actor: string, target: Named | null): string {
  const name = action.name;
  if (name.includes('содержание')) return `${actor} просит содержание`;
  if (name.includes('пир')) return `${actor} устраивает пир`;
  if (name.includes('слух')) {
    return target ? `${actor} распускает слух против ${genOf(target)}` : `${actor} распускает слух`;
  }
  if (name.includes('Сменить')) {
    /* «Сменить карту» и «Сменить 2 карты» — одно действие с двумя названиями;
       различает их число отданных карт, а не текст. */
    const two = (action.stakedCardIds?.length ?? 1) >= 2;
    return `${actor} меняет ${two ? 'карты' : 'карту'}`;
  }
  return `${actor}: ${name}`;
}

/** Подпись к разыгранному инстанту. */
function instantCaption(instant: InstantType, actor: string, target: Named | null): string {
  switch (instant) {
    case 'Обыск покоев':
      return target ? `${actor} обыскивает покои ${genOf(target)}` : `${actor} обыскивает покои`;
    case 'Обвинение в измене':
      return target ? `${actor} обвиняет ${accOf(target)} в измене` : `${actor} обвиняет в измене`;
    case 'Дворцовый переполох':
      return target ? `${actor} устраивает переполох у ${genOf(target)}` : `${actor} устраивает переполох`;
    case 'Перенаправление':
      return target ? `${actor} переводит удар на ${accOf(target)}` : `${actor} переводит удар`;
    case 'Право вето':
      return `${actor} накладывает вето`;
    case 'Ва-банк':
      return `${actor} идёт ва-банк`;
    default:
      return `${actor}: ${instant}`;
  }
}

/**
 * Что происходит в середине стола — одной фразой.
 *
 * `null`, если рассказывать нечего: подпись без действия — это подпись ни к
 * чему.
 */
export function tableCaption(action: Action | null, players: Named[]): string | null {
  if (!action) return null;

  const actorPlayer = who(players, action.actorId);
  const actor = actorPlayer?.name ?? 'Придворный';
  const target = who(players, action.targetId);

  /* Разряженный «Тайный заговор»: бьёт не карта на столе, а накопленные
     заряды, и говорить о нём надо как об ударе, а не как о выкладке. */
  if (action.conspiracyEffect) {
    const hit = action.conspiracyEffect === 'crown' ? 'корону' : 'казну';
    return target
      ? `${actor} свершает заговор против ${genOf(target)}: ${hit}`
      : `${actor} свершает заговор`;
  }

  /* Утренний триггер: интрига срабатывает сама, в начале хода владельца. */
  if (action.isMorningTrigger) {
    return `${actor} получает награду: «${action.plotType ?? action.name}»`;
  }

  if (action.type === 'normal') return normalCaption(action, actor, target);
  if (action.type === 'instant' && action.instantType) {
    return instantCaption(action.instantType, actor, target);
  }
  if (action.type === 'plot') {
    return `${actor} выкладывает интригу «${action.plotType ?? action.name}»`;
  }

  if (action.roleClaim) {
    const claim = `${actor} заявляет ${roleAcc(action.roleClaim)}`;
    return target ? `${claim} против ${genOf(target)}` : claim;
  }

  return `${actor}: ${action.name}`;
}

/**
 * Подпись к инстанту, положенному ПОВЕРХ чужого действия.
 *
 * У него свой автор — тот, кто вмешался, — и рассказывать надо про него, а не
 * про того, чей ход перебивают.
 */
export function overlayCaption(
  overlay: { card: string; actorId: string } | null,
  action: Action | null,
  players: Named[]
): string | null {
  if (!overlay) return null;
  const actor = who(players, overlay.actorId)?.name ?? 'Придворный';
  if (overlay.card === 'Перенаправление') {
    return instantCaption('Перенаправление', actor, who(players, action?.targetId));
  }
  return instantCaption(overlay.card as InstantType, actor, null);
}
