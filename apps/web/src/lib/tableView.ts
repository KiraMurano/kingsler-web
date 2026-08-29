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
import type {
  Action,
  DuelOutcome,
  GameCard,
  GameState,
  Player,
  RevealOutcome,
  Role
} from '@kinglier/engine/types';
import { accOf, genOf } from '@kinglier/engine/utils/russianText';
import type { GameRules } from '@kinglier/engine/rules';
import { doubtPayment } from '@kinglier/engine/resolvers/doubtResolver';

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

export type BarActionKind =
  | 'exchange-confirm'
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
  /** Что кнопка сделает. Показывается тултипом, а не подписью под текстом:
   *  подпись внутри кнопки меняла её высоту и ломала ряд. */
  hint: string;
  /** Стоит ли действие жетона ⚡. Рисуется значком на самой кнопке. */
  spendsToken: boolean;
  /**
   * Перечёркивать ли молнию красным запретом.
   *
   * Только когда причина именно в жетонах. «Действие двора уже было» — не про
   * жетоны: они на месте, и перечёркнутая молния в этом случае врёт.
   */
  tokenBlocked: boolean;
  /** Почему нельзя. Заменяет `hint` в тултипе, когда кнопка глуха. */
  reason?: string;
}

export type CardMenuKind = 'play' | 'bluff' | 'inspect' | 'veto' | 'duel-shield' | 'duel-bluff';

export interface CardMenuOption {
  kind: CardMenuKind;
  label: string;
  tone: Tone;
  disabled: boolean;
  /** Что пункт сделает. Тултипом, как и у кнопок панели. */
  hint: string;
  /** Стоит ли действие жетона ⚡ — см. `BarButton.spendsToken`. */
  spendsToken: boolean;
  /** Перечёркивать ли молнию — см. `BarButton.tokenBlocked`. */
  tokenBlocked: boolean;
  reason?: string;
}

export interface TableView {
  id: string;
  phase: PhaseKind;
  title: string;
  /**
   * Имя, дописываемое к заголовку через двоеточие.
   *
   * Живёт отдельно от `title`, потому что заголовок набран капителью, а ник —
   * это то, как игрок себя назвал: «Герцог Виктор», а не «ГЕРЦОГ ВИКТОР».
   * Регистр чужого имени менять не наше дело.
   */
  titleName?: string;
  /**
   * Что происходит и что от игрока требуется — одной фразой.
   *
   * Правая колонка не повторяет то, что и так нарисовано за столом: чьи это
   * жетоны, какой у карты арт, кто уже ответил. Всё это видно на самом столе.
   * Колонка отвечает на единственный вопрос, на который стол не отвечает:
   * «что сейчас и что мне делать».
   */
  guidance: string;
  /**
   * Что только что случилось — короткой фразой, с эмодзи под иконки.
   *
   * Не пересказ летописи: та пишет подробно и для разбора партии, а здесь
   * нужно то, что читается краем глаза, не отрываясь от стола. Пусто, когда
   * рассказывать нечего.
   */
  event: string;
  deadlineAt: number | null;
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
  /** Разрешено ли правилами партии класть вето поверх вето. */
  vetoOnVeto: boolean;
  /** Правила партии целиком — из них берётся цена платной проверки. */
  rules: GameRules;
  vetoDeadlineAt: number | null;
  coronationCandidateId: string | null;
  revealOutcome: RevealOutcome | null;
  duelOutcome: DuelOutcome | null;
  /**
   * Какие карты руки отмечены к обмену, пока идёт выбор. `null` — выбор не
   * открыт.
   *
   * Единственное поле здесь, которого нет в сторе: это состояние интерфейса,
   * ровно как прицел. Но правая колонка обязана показывать «Сменить N карт»
   * согласованно с тем, что подсвечено на столе, а согласованность в этом
   * приложении держит одна модель — значит, выбор входит в неё, а не живёт
   * рядом второй правдой.
   */
  exchangePick: CardId[] | null;
}

const ref = (p: Player): PlayerRef => ({ id: p.id, name: p.name, avatar: p.avatar });

/** Роль-щит против конкретного нападения. Против Вора — Казначей, иначе Рыцарь. */
export function shieldRoleFor(roleClaim: string | undefined): Role {
  return roleClaim === 'Вор' ? 'Казначей' : 'Рыцарь';
}

function inspectOption(): CardMenuOption {
  return {
    kind: 'inspect',
    hint: 'Открыть правило карты и её тактику',
    label: 'Подробнее',
    tone: 'calm',
    disabled: false,
    spendsToken: false,
    tokenBlocked: false
  };
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
    if (!hasTokens) reason = 'Нет жетонов действия.';
    else if (plot && input.hasPlayedPlotThisTurn) reason = 'Интрига уже была в этом ходу.';
    else if (role && input.hasPlayedRoleThisTurn) reason = 'Роль уже была в этом ходу.';
    else if (role && viewer.gold < info.cost) reason = 'Не хватает золота.';

    options.push({
      kind: 'play',
      hint: 'Сыграть карту тем, что она есть, — открыто и без блефа',
      label: 'Разыграть',
      tone: 'calm',
      disabled: !!reason,
      spendsToken: true,
      tokenBlocked: reason === 'Нет жетонов действия.',
      reason
    });
  }

  const bluffReason = !hasTokens
    ? 'Нет жетонов действия.'
    : input.hasPlayedRoleThisTurn
      ? 'Роль уже была в этом ходу.'
      : undefined;
  options.push({
    kind: 'bluff',
    hint: 'Положить карту взакрытую и заявить любую роль двора',
    label: 'Блеф',
    tone: 'danger',
    disabled: !!bluffReason,
    spendsToken: true,
    tokenBlocked: bluffReason === 'Нет жетонов действия.',
    reason: bluffReason
  });

  options.push(inspectOption());
  return options;
}

/** Меню карты, когда зритель — цель нападения. */
function underAttackMenu(card: GameCard, viewer: Player, input: TableViewInput): CardMenuOption[] {
  const options: CardMenuOption[] = [];
  const hasTokens = viewer.actionTokens >= 1;
  const noTokens = hasTokens ? undefined : 'Нет жетонов действия.';
  const shield = shieldRoleFor(input.pendingAction?.roleClaim);

  if (card === 'Перенаправление') {
    options.push({
      kind: 'play',
      hint: 'Перевести нападение на другого придворного. Защищаться будет он',
      label: 'Разыграть',
      tone: 'calm',
      disabled: false,
      /* Перенаправление — защитный реактивный инстант: 0 ⚡. */
      spendsToken: false,
      tokenBlocked: false
    });
    options.push({
      kind: 'duel-bluff',
      hint: 'Выставить карту как щит вслепую. Примут вызов — блеф раскроется',
      label: 'Дуэль: блеф',
      tone: 'danger',
      disabled: !hasTokens,
      spendsToken: true,
      tokenBlocked: !hasTokens,
      reason: noTokens
    });
  } else if (card === shield) {
    options.push({
      kind: 'duel-shield',
      hint: 'Выставить настоящий щит: при вскрытии он остановит нападение',
      label: 'Дуэль: защита',
      tone: 'good',
      disabled: !hasTokens,
      spendsToken: true,
      tokenBlocked: !hasTokens,
      reason: noTokens
    });
  } else {
    options.push({
      kind: 'duel-bluff',
      hint: 'Выставить карту как щит вслепую. Примут вызов — блеф раскроется',
      label: 'Дуэль: блеф',
      tone: 'danger',
      disabled: !hasTokens,
      spendsToken: true,
      tokenBlocked: !hasTokens,
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
  /* Обычно поверх уже наложенного вето класть нечего. С правилом «вето на
     вето» — наоборот: встречное вето снимает предыдущее, и карта остаётся
     играбельной всю цепочку. */
  if (phase === 'veto' && card === 'Право вето' && (!input.isVetoed || input.vetoOnVeto)) {
    return [
      {
        kind: 'veto',
        hint: input.isVetoed
          ? 'Снять чужое вето встречным. Карта уйдёт в сброс'
          : 'Отменить готовящийся эффект. Карта уйдёт в сброс',
        label: input.isVetoed ? 'Вето на вето' : 'Наложить вето',
        tone: 'danger',
        disabled: false,
        spendsToken: false,
        tokenBlocked: false
      },
      inspectOption()
    ];
  }
  return [inspectOption()];
}

function barFor(phase: PhaseKind, viewer: Player, input: TableViewInput): BarButton[] {
  const hasTokens = viewer.actionTokens >= 1;
  const noTokens = hasTokens ? undefined : 'Нет жетонов действия.';

  /* Проверку можно оплатить золотом, если правила это разрешают, а жетона нет.
     Кнопка обязана показывать, чем именно платит игрок: цена в 🪙 — это уже не
     «бесплатная реакция за жетон», и путать одно с другим нельзя. */
  const payment = input.pendingAction
    ? doubtPayment(input.rules, viewer, input.pendingAction)
    : null;
  const paysGold = !!payment && payment.gold > 0;
  const canDoubt = !!payment;
  const doubtLabel = paysGold ? `Не верю · ${payment.gold} 🪙` : 'Не верю';
  const doubtReason = canDoubt
    ? undefined
    : hasTokens
      ? undefined
      : input.rules.paidDoubtEnabled || input.rules.unmaskEnabled
        ? 'Нет жетонов, а золота не хватает на платную проверку.'
        : noTokens;

  switch (phase) {
    case 'turn': {
      /* Пока выбирают карты к обмену, колонка показывает только этот выбор.
         Отмена живёт в баннере над столом, а «Завершить ход» посреди выбора —
         это ход, отданный по случайности. */
      if (input.exchangePick) {
        const picked = input.exchangePick.length;
        return [
          {
            kind: 'exchange-confirm',
            spendsToken: true,
            tokenBlocked: !hasTokens,
            label: picked === 1 ? 'Сменить 1 карту' : picked === 2 ? 'Сменить 2 карты' : 'Сменить карты',
            tone: 'gold',
            disabled: picked === 0 || !hasTokens,
            hint: 'Сбросить отмеченные карты и тут же добрать столько же',
            reason: picked === 0 ? 'Ни одна карта не отмечена.' : noTokens
          }
        ];
      }

      const courtReason =
        input.hasUsedNormalActionThisTurn || input.turnSubPhase !== 'NORMAL_ACTION_PHASE'
          ? 'Действие двора уже было в этом ходу.'
          : noTokens;
      const bar: BarButton[] = [
        {
          kind: 'court-actions',
          spendsToken: true,
          tokenBlocked: !hasTokens,
          label: 'Действия двора',
          tone: 'calm',
          disabled: !!courtReason,
          hint: 'Содержание, пир, слух или обмен карт. Оспорить их нельзя',
          reason: courtReason
        }
      ];
      const charges =
        viewer.activePlot?.type === 'Тайный заговор' ? (viewer.activePlot.charges ?? 0) : 0;
      if (charges >= 1) {
        bar.push({
          kind: 'conspiracy',
          spendsToken: true,
          tokenBlocked: !hasTokens,
          label: `Свершить заговор · ${charges}/4`,
          tone: 'arcane',
          disabled: !hasTokens,
          hint: 'Ударить по казне соперника, а с трёх зарядов — по короне',
          reason: noTokens
        });
      }
      bar.push({
        kind: 'end-turn',
        spendsToken: false,
        tokenBlocked: false,
        label: 'Завершить ход',
        /* Красная: это единственная кнопка своего хода, которая необратимо
           отдаёт ход дальше. */
        tone: 'danger',
        disabled: false,
        hint: 'Добрать карты и передать ход. Неистраченные ⚡ останутся на защиту'
      });
      return bar;
    }
    case 'doubt':
      return [
        {
          kind: 'doubt',
          spendsToken: !paysGold,
          tokenBlocked: !canDoubt,
          label: doubtLabel,
          tone: 'danger',
          disabled: !canDoubt,
          hint: paysGold
            ? 'Купить проверку за золото. Карта вскроется — и кто-то из двоих потеряет её'
            : 'Проверить заявление. Карта вскроется — и кто-то из двоих потеряет её',
          reason: doubtReason
        },
        {
          kind: 'believe',
          spendsToken: false,
          tokenBlocked: false,
          label: 'Верю',
          tone: 'good',
          disabled: false,
          hint: 'Пропустить проверку. Действие сработает как заявлено'
        }
      ];
    case 'under-attack':
      return [
        {
          kind: 'accept-attack',
          spendsToken: false,
          tokenBlocked: false,
          label: 'Принять',
          tone: 'calm',
          disabled: false,
          hint: 'Позволить нападению сработать, ничего не тратя'
        },
        {
          kind: 'doubt',
          spendsToken: !paysGold,
          tokenBlocked: !canDoubt,
          label: doubtLabel,
          tone: 'danger',
          disabled: !canDoubt,
          hint: paysGold
            ? 'Сорвать маску за золото. Карта нападающего вскроется'
            : 'Проверить заявление нападающего. Его карта вскроется',
          reason: doubtReason
        }
      ];
    case 'duel-answer':
      return [
        {
          kind: 'duel-accept',
          spendsToken: false,
          tokenBlocked: false,
          label: 'Принять бой',
          tone: 'danger',
          disabled: false,
          hint: 'Обе карты вскроются одновременно'
        },
        {
          kind: 'duel-retreat',
          spendsToken: false,
          tokenBlocked: false,
          label: 'Отступить',
          tone: 'calm',
          disabled: false,
          hint: 'Отозвать нападение. Ваша карта уйдёт в сброс'
        }
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
  /* Свой ход важнее любого объявления.
   *
   * Круг коронации шёл первым — и на своём же ходу игрок получал вместо кнопок
   * табличку «сбейте влияние претендента». Сбивать было нечем: панель действий
   * не появлялась, и стол стоял до конца круга. Круг — это объявление, а не
   * фаза, отбирающая ход; предупреждение о нём переехало в `guidance`. */
  if (activePlayerId === viewer.id && turnPhase === 'IDLE' && !pendingAction) return 'turn';
  if (input.coronationCandidateId) return 'coronation';
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
      return actor ? 'Ход' : 'Ожидание';
  }
}

/** Имя в заголовке — только там, где заголовок кого-то называет. */
function titleNameFor(phase: PhaseKind, actor: PlayerRef | null): string | undefined {
  if (phase !== 'waiting' || !actor) return undefined;
  return actor.name;
}

/**
 * Что происходит и что делать — одной фразой.
 *
 * Здесь нет ничего, что уже нарисовано за столом: ни жетонов, ни арта, ни
 * списка ответивших. Только то, чего по столу не прочесть.
 */
function guidanceFor(phase: PhaseKind, input: TableViewInput, viewer: Player): string {
  const { players, pendingAction, activePlayerId } = input;
  const имя = (id?: string) => players.find(p => p.id === id)?.name ?? 'придворный';

  /*
   * Только указание к действию — кто что сделал, уже сказано в `event`, и
   * повторять это здесь значит печатать одну фразу дважды подряд.
   */
  switch (phase) {
    case 'turn':
      /* Идущий круг коронации — самое важное, что игрок должен знать на своём
         ходу: это последний шанс сбить претендента. */
      if (input.coronationCandidateId && input.coronationCandidateId !== viewer.id) {
        const претендент = players.find(p => p.id === input.coronationCandidateId);
        return претендент
          ? `Круг коронации: сбейте влияние ${accOf(претендент)}, пока круг не замкнулся.`
          : 'Круг коронации: сбейте влияние претендента, пока круг не замкнулся.';
      }
      if (input.coronationCandidateId === viewer.id) {
        return 'Круг коронации идёт за вас — удержите короны до конца круга.';
      }
      return 'Выберите действие двора или нажмите на карту, чтобы сыграть её.';
    case 'doubt':
      return 'Поверить или проверить?';
    case 'reveal':
      return 'Карта вскрывается.';
    case 'under-attack':
      return 'Примите, проверьте заявление или выставьте карту на дуэль.';
    case 'duel-answer':
      return 'Вскрывать карты или отступить?';
    case 'veto':
      return holdsVeto(viewer) ? 'Можно наложить вето.' : 'Двор может вмешаться.';
    case 'coronation':
      return 'Сбейте влияние претендента, пока круг не замкнулся.';
    default:
      /* В чужой ход `event` уже рассказывает, что происходит; добавлять к нему
         «Ходит N» незачем. Фраза нужна только когда за столом тихо. */
      return pendingAction ? '' : `Ходит ${имя(activePlayerId)}.`;
  }
}

/**
 * Что только что случилось. Одна фраза, и только та, которую по столу не
 * прочесть с одного взгляда.
 */
function eventFor(input: TableViewInput): string {
  const { players, revealOutcome, duelOutcome, pendingAction } = input;
  const кто = (id?: string) => players.find(p => p.id === id);
  const имя = (id?: string) => кто(id)?.name ?? 'придворный';
  /* Склоняем по игроку, а не по строке: имена ботов придуманы нами и склоняются,
     ники живых игроков — нет. */
  const вин = (id?: string) => { const p = кто(id); return p ? accOf(p) : 'придворного'; };
  const род = (id?: string) => { const p = кто(id); return p ? genOf(p) : 'придворного'; };
  const печать = (id?: string) => (id ? ` ${имя(id)} получает +1 ⚜️.` : '');

  if (revealOutcome) {
    const r = revealOutcome;
    return r.wasTruth
      ? `${имя(r.accusedId)} говорил правду: «${r.revealedRole}».${печать(r.sealsWinnerId)}`
      : `${имя(r.accuserId)} разоблачил ${вин(r.accusedId)}: блеф.${печать(r.sealsWinnerId)}`;
  }

  if (duelOutcome) {
    const d = duelOutcome;
    if (d.attackerWasTruth && !d.defenderWasTruth) {
      return `Дуэль: щит ${род(d.defenderId)} оказался блефом.${печать(d.sealsWinnerId)}`;
    }
    if (!d.attackerWasTruth && d.defenderWasTruth) {
      return `Дуэль: нападение ${род(d.attackerId)} оказалось блефом.${печать(d.sealsWinnerId)}`;
    }
    return `Дуэль ${имя(d.attackerId)} и ${имя(d.defenderId)} разрешилась.${печать(d.sealsWinnerId)}`;
  }

  if (pendingAction) {
    const a = pendingAction;
    const кто = имя(a.actorId);
    const цель = a.targetId ? ` на ${вин(a.targetId)}` : '';
    if (a.type === 'normal') return `${кто}: ${a.name.toLowerCase()}.`;
    if (a.type === 'plot') return `${кто} выкладывает интригу «${a.plotType}».`;
    if (a.type === 'instant') return `${кто} играет «${a.instantType}».`;
    return `${кто} заявляет «${a.roleClaim}»${цель}.`;
  }

  return '';
}

function holdsVeto(viewer: Player): boolean {
  return viewer.hand.some(h => h.card === 'Право вето');
}

/** Что показывать, когда стола ещё нет: первый кадр партии, до раздачи. */
const EMPTY_VIEW: TableView = {
  id: 'empty',
  phase: 'waiting',
  title: 'Ожидание',
  guidance: 'Двор собирается.',
  event: '',
  deadlineAt: null,
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
  const actorRef = actorPlayer ? ref(actorPlayer) : null;
  const title = titleFor(phase, actorRef);
  const titleName = titleNameFor(phase, actorRef);
  const guidance = guidanceFor(phase, input, viewer);
  const event = eventFor(input);
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
    title,
    titleName ?? '',
    input.exchangePick ? `pick:${input.exchangePick.join('.')}` : '',
    guidance,
    event,
    bar.map(b => `${b.kind}${b.disabled ? '!' : ''}`).join(','),
    viewerHandIds
      .map(cid => menus[cid].map(o => `${o.kind}${o.disabled ? '!' : ''}`).join('.'))
      .join('|')
  ].join('~');

  return {
    id,
    phase,
    title,
    titleName,
    guidance,
    event,
    deadlineAt: phase === 'veto' ? input.vetoDeadlineAt : null,
    bar,
    viewerHandIds,
    menus
  };
}
