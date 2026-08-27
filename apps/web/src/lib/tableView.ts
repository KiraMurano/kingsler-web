/**
 * Единственная производная правда о том, что видно за столом.
 *
 * Правая колонка, панель над картами и меню на карте — три отрисовки одного
 * значения. Раньше каждая из них выводила своё состояние сама, из сырых полей
 * стора, и они расходились: панель уже показывала новую фазу, пока меню ещё
 * предлагало действие из старой.
 *
 * `id` — договор с `AnimatePresence`. Он собирается ИСКЛЮЧИТЕЛЬНО из того, что
 * нарисовано, и никогда из `pendingAction.id`. Ход бота, который ничего не
 * меняет на экране игрока, обязан дать прежний `id`, иначе панель будет
 * пересоздаваться на каждое чужое действие — ровно тот дефект, ради которого
 * этот файл существует.
 */
import { CARD_DESCRIPTIONS, isInstant, isPlot } from '@kinglier/engine/data/cardDescriptions';
import type { CardId, CardInstance } from '@kinglier/engine/cardInstance';
import type { Action, GameCard, GameState, Player, Role } from '@kinglier/engine/types';

/** Инстанты, которые владелец может выложить открыто в свой ход. */
const OPENLY_PLAYABLE_INSTANTS: GameCard[] = [
  'Обыск покоев',
  'Дворцовый переполох',
  'Обвинение в измене'
];

export type PhaseKind =
  | 'turn'
  | 'waiting'
  | 'doubt'
  | 'reveal'
  | 'under-attack'
  | 'duel-answer'
  | 'veto'
  | 'coronation';

export interface PlayerRef {
  id: string;
  name: string;
  avatar?: string;
}

export interface ClaimRef {
  card: GameCard;
  rule: string;
}

export type BarActionKind =
  | 'court-actions'
  | 'conspiracy'
  | 'end-turn'
  | 'doubt'
  | 'believe'
  | 'accept-attack'
  | 'duel-accept'
  | 'duel-retreat';

export type Tone = 'gold' | 'danger' | 'calm' | 'good' | 'arcane';

export interface BarButton {
  kind: BarActionKind;
  label: string;
  tone: Tone;
  disabled: boolean;
  /** Одно слово, печатается на глухой кнопке. Скрывать кнопку нельзя. */
  reason?: string;
}

export type CardMenuKind = 'play' | 'bluff' | 'inspect' | 'veto' | 'duel-shield' | 'duel-bluff';

export interface CardMenuOption {
  kind: CardMenuKind;
  label: string;
  tone: Tone;
  disabled: boolean;
  reason?: string;
}

export interface TableView {
  id: string;
  phase: PhaseKind;
  title: string;
  actor: PlayerRef | null;
  claim: ClaimRef | null;
  awaiting: PlayerRef[];
  deadlineAt: number | null;
  tokens: number;
  spent: { court: boolean; plot: boolean; role: boolean };
  bar: BarButton[];
  /** Порядок слотов руки зрителя — тесты и `Hand` обходят её по нему. */
  viewerHandIds: CardId[];
  menus: Record<CardId, CardMenuOption[]>;
}

/** Ровно те поля стора, от которых зависит картинка. Ничего лишнего: всё, что
 *  сюда попадёт, начнёт участвовать в `id` и вернёт моргание. */
export interface TableViewInput {
  players: Player[];
  activePlayerId: string;
  turnPhase: GameState['turnPhase'];
  turnSubPhase: GameState['turnSubPhase'];
  pendingAction: Action | null;
  pendingDoubtDoubterId: string | null;
  pendingDoubtPassedIds: string[];
  hasUsedNormalActionThisTurn: boolean;
  hasPlayedRoleThisTurn: boolean;
  hasPlayedPlotThisTurn: boolean;
  isVetoed: boolean;
  vetoDeadlineAt: number | null;
  coronationCandidateId: string | null;
}

const ref = (p: Player): PlayerRef => ({ id: p.id, name: p.name, avatar: p.avatar });

/** Роль-щит против конкретного нападения. Против Вора — Казначей, иначе Рыцарь. */
export function shieldRoleFor(roleClaim: string | undefined): Role {
  return roleClaim === 'Вор' ? 'Казначей' : 'Рыцарь';
}

function claimOf(action: Action | null): ClaimRef | null {
  const card = (action?.roleClaim ?? action?.plotType ?? action?.instantType) as
    | GameCard
    | undefined;
  if (!card) return null;
  return { card, rule: CARD_DESCRIPTIONS[card].shortDescription };
}

function inspectOption(): CardMenuOption {
  return { kind: 'inspect', label: 'Подробнее', tone: 'calm', disabled: false };
}

/** Меню карты в свой ход. */
function ownTurnMenu(card: GameCard, viewer: Player, input: TableViewInput): CardMenuOption[] {
  const options: CardMenuOption[] = [];
  const hasTokens = viewer.actionTokens >= 1;
  const plot = isPlot(card);
  const instant = isInstant(card);
  const role = !plot && !instant;

  /* Роли и интриги играются по номиналу всегда; из инстантов — только те, что
     выкладываются открыто. Реактивные (вето, перенаправление) и Ва-банк ждут
     своего окна или работают модификатором, разыграть их в свой ход нельзя. */
  const playable = plot || role || OPENLY_PLAYABLE_INSTANTS.includes(card);

  if (playable) {
    const info = CARD_DESCRIPTIONS[card];
    let reason: string | undefined;
    if (!hasTokens) reason = 'нет ⚡';
    else if (plot && input.hasPlayedPlotThisTurn) reason = 'интрига уже была';
    else if (role && input.hasPlayedRoleThisTurn) reason = 'роль уже была';
    else if (role && viewer.gold < info.cost) reason = 'дорого';

    options.push({ kind: 'play', label: 'Разыграть', tone: 'gold', disabled: !!reason, reason });
  }

  const bluffReason = !hasTokens
    ? 'нет ⚡'
    : input.hasPlayedRoleThisTurn
      ? 'роль уже была'
      : undefined;
  options.push({
    kind: 'bluff',
    label: 'Блеф',
    tone: 'arcane',
    disabled: !!bluffReason,
    reason: bluffReason
  });

  options.push(inspectOption());
  return options;
}

/** Меню карты, когда зритель — цель нападения. */
function underAttackMenu(card: GameCard, viewer: Player, input: TableViewInput): CardMenuOption[] {
  const options: CardMenuOption[] = [];
  const hasTokens = viewer.actionTokens >= 1;
  const noTokens = hasTokens ? undefined : 'нет ⚡';
  const shield = shieldRoleFor(input.pendingAction?.roleClaim);

  if (card === 'Перенаправление') {
    options.push({ kind: 'play', label: 'Разыграть', tone: 'gold', disabled: false });
    options.push({
      kind: 'duel-bluff',
      label: 'Дуэль: блеф',
      tone: 'danger',
      disabled: !hasTokens,
      reason: noTokens
    });
  } else if (card === shield) {
    options.push({
      kind: 'duel-shield',
      label: 'Дуэль: защита',
      tone: 'good',
      disabled: !hasTokens,
      reason: noTokens
    });
  } else {
    options.push({
      kind: 'duel-bluff',
      label: 'Дуэль: блеф',
      tone: 'danger',
      disabled: !hasTokens,
      reason: noTokens
    });
  }

  options.push(inspectOption());
  return options;
}

function menuFor(
  held: CardInstance,
  phase: PhaseKind,
  viewer: Player,
  input: TableViewInput
): CardMenuOption[] {
  const card = held.card;
  if (phase === 'turn') return ownTurnMenu(card, viewer, input);
  if (phase === 'under-attack') return underAttackMenu(card, viewer, input);
  if (phase === 'veto' && card === 'Право вето' && !input.isVetoed) {
    return [
      { kind: 'veto', label: 'Наложить вето', tone: 'danger', disabled: false },
      inspectOption()
    ];
  }
  return [inspectOption()];
}

function barFor(phase: PhaseKind, viewer: Player, input: TableViewInput): BarButton[] {
  const hasTokens = viewer.actionTokens >= 1;
  const noTokens = hasTokens ? undefined : 'нет ⚡';

  switch (phase) {
    case 'turn': {
      const courtReason =
        input.hasUsedNormalActionThisTurn || input.turnSubPhase !== 'NORMAL_ACTION_PHASE'
          ? 'уже было'
          : noTokens;
      const bar: BarButton[] = [
        {
          kind: 'court-actions',
          label: 'Действия двора',
          tone: 'calm',
          disabled: !!courtReason,
          reason: courtReason
        }
      ];
      const charges =
        viewer.activePlot?.type === 'Тайный заговор' ? (viewer.activePlot.charges ?? 0) : 0;
      if (charges >= 1) {
        bar.push({
          kind: 'conspiracy',
          label: `Свершить заговор · ${charges}/4`,
          tone: 'arcane',
          disabled: !hasTokens,
          reason: noTokens
        });
      }
      bar.push({ kind: 'end-turn', label: 'Завершить ход', tone: 'gold', disabled: false });
      return bar;
    }
    case 'doubt':
      return [
        { kind: 'doubt', label: 'Не верю', tone: 'danger', disabled: !hasTokens, reason: noTokens },
        { kind: 'believe', label: 'Верю', tone: 'good', disabled: false }
      ];
    case 'under-attack':
      return [
        { kind: 'accept-attack', label: 'Принять', tone: 'calm', disabled: false },
        { kind: 'doubt', label: 'Не верю', tone: 'danger', disabled: !hasTokens, reason: noTokens }
      ];
    case 'duel-answer':
      return [
        { kind: 'duel-accept', label: 'Принять бой', tone: 'danger', disabled: false },
        { kind: 'duel-retreat', label: 'Отступить', tone: 'calm', disabled: false }
      ];
    default:
      return [];
  }
}

function phaseOf(input: TableViewInput, viewer: Player): PhaseKind {
  const { turnPhase, pendingAction, activePlayerId, pendingDoubtDoubterId } = input;
  if (pendingDoubtDoubterId) return 'reveal';
  if (turnPhase === 'TARGET_REACTION_WINDOW' && pendingAction?.targetId === viewer.id) {
    return 'under-attack';
  }
  if (turnPhase === 'DUEL_ATTACKER_WINDOW' && pendingAction?.actorId === viewer.id) {
    return 'duel-answer';
  }
  if (turnPhase === 'VETO_WINDOW') return 'veto';
  if (turnPhase === 'DOUBT_WINDOW' && pendingAction?.actorId !== viewer.id) return 'doubt';
  if (input.coronationCandidateId) return 'coronation';
  if (activePlayerId === viewer.id && turnPhase === 'IDLE' && !pendingAction) return 'turn';
  return 'waiting';
}

function titleFor(phase: PhaseKind, actor: PlayerRef | null): string {
  switch (phase) {
    case 'turn':
      return 'Ваш ход';
    case 'doubt':
      return 'Окно сомнений';
    case 'reveal':
      return 'Проверка';
    case 'under-attack':
      return 'Вас атакуют';
    case 'duel-answer':
      return 'Вызов на дуэль';
    case 'veto':
      return 'Окно вето';
    case 'coronation':
      return 'Круг коронации';
    default:
      return actor ? `Ход: ${actor.name}` : 'Ожидание';
  }
}

/** Кого ещё ждут. Пусто там, где решение принимает один игрок. */
function awaitingFor(phase: PhaseKind, input: TableViewInput): PlayerRef[] {
  const { players, pendingAction, pendingDoubtPassedIds } = input;
  if (phase === 'doubt' && pendingAction) {
    return players
      .filter(p => p.id !== pendingAction.actorId && !pendingDoubtPassedIds.includes(p.id))
      .map(ref);
  }
  if (phase === 'under-attack' && pendingAction?.targetId) {
    const target = players.find(p => p.id === pendingAction.targetId);
    return target ? [ref(target)] : [];
  }
  return [];
}

/** Что показывать, когда стола ещё нет: первый кадр партии, до раздачи. */
const EMPTY_VIEW: TableView = {
  id: 'empty',
  phase: 'waiting',
  title: 'Ожидание',
  actor: null,
  claim: null,
  awaiting: [],
  deadlineAt: null,
  tokens: 0,
  spent: { court: false, plot: false, role: false },
  bar: [],
  viewerHandIds: [],
  menus: {}
};

export function deriveTableView(input: TableViewInput, viewerId: string): TableView {
  const viewer = input.players.find(p => p.id === viewerId) ?? input.players[0];
  /* На первом кадре партии игроков ещё нет, а хук уже считается — App
     отрисовывает заставку «СОЗЫВ ДВОРА» ниже по телу компонента, и до неё
     дело не дойдёт, если здесь бросить исключение. */
  if (!viewer) return EMPTY_VIEW;

  const phase = phaseOf(input, viewer);
  const actorPlayer = input.players.find(
    p => p.id === (input.pendingAction?.actorId ?? input.activePlayerId)
  );
  const actor = actorPlayer ? ref(actorPlayer) : null;
  const claim = claimOf(input.pendingAction);
  const awaiting = awaitingFor(phase, input);
  const bar = barFor(phase, viewer, input);

  const viewerHandIds = viewer.hand.map(h => h.id);
  const menus: Record<CardId, CardMenuOption[]> = {};
  for (const held of viewer.hand) {
    menus[held.id] = menuFor(held, phase, viewer, input);
  }

  /* Подпись под тем, что нарисовано. Всё, чего здесь нет, менять картинку не
     имеет права; всё, что здесь есть, обязано её менять. */
  const id = [
    phase,
    actor?.id ?? '-',
    claim?.card ?? '-',
    awaiting.map(a => a.id).join(','),
    bar.map(b => `${b.kind}${b.disabled ? '!' : ''}${b.reason ?? ''}`).join(','),
    viewerHandIds
      .map(cid => menus[cid].map(o => `${o.kind}${o.disabled ? '!' : ''}`).join('.'))
      .join('|')
  ].join('~');

  return {
    id,
    phase,
    title: titleFor(phase, actor),
    actor,
    claim,
    awaiting,
    deadlineAt: phase === 'veto' ? input.vetoDeadlineAt : null,
    tokens: viewer.actionTokens,
    spent: {
      court: input.hasUsedNormalActionThisTurn,
      plot: input.hasPlayedPlotThisTurn,
      role: input.hasPlayedRoleThisTurn
    },
    bar,
    viewerHandIds,
    menus
  };
}
