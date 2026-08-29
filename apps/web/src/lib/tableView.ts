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
import { holds } from '@kinglier/engine/cardInstance';
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
import { CONSPIRACY_FULL_CHARGE } from '@kinglier/engine/resolvers/plotResolver';
import type { GameRules } from '@kinglier/engine/rules';
import { doubtPayment } from '@kinglier/engine/resolvers/doubtResolver';
import { vetoAnswerRequired, vetoTopActorId } from '@kinglier/engine/resolvers/vetoChain';

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
  /** Начать выбор карты-щита. Сама дуэль объявляется нажатием на карту. */
  | 'duel'
  /** «Пропустить» в окне вето. Окно держится ответами, а не таймером. */
  | 'veto-pass';

export type Tone = 'gold' | 'danger' | 'calm' | 'good' | 'arcane' | 'ember';

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

export type CardMenuKind =
  | 'play'
  | 'bluff'
  | 'inspect'
  | 'veto'
  | 'duel-shield'
  | 'duel-bluff'
  /** Разрядка заряженного «Тайного заговора» — по нажатию на саму карту. */
  | 'conspiracy'
  /** Переключатель: подключить «Ва-банк» к розыгрышу этой карты. */
  | 'vabanque';

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
  /**
   * Пункт-переключатель и его состояние.
   *
   * Есть только у «Ва-банка»: он ничего не делает сам, а меняет то, что
   * сделают соседние пункты. Кнопка, которая не действует, а взводит, обязана
   * показывать, взведена она или нет.
   */
  toggle?: boolean;
  active?: boolean;
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
  /**
   * Идёт ли открытие партии. Пока идёт — стол ходов не принимает, и показывать
   * их нечем.
   */
  opening: GameState['opening'];
  /** Сколько «Прав вето» лежит в текущей цепочке. Решает, кого спрашивают. */
  vetoChain: number;
  /** Кто уже нажал «Пропустить» в текущем круге окна вето. */
  pendingVetoPassedIds: string[];
  /** Что лежит поверх действия: по нему узнаётся последний наложивший вето. */
  overlayInstant: GameState['overlayInstant'];
  /** Разрешено ли правилами партии класть вето поверх вето. */
  vetoOnVeto: boolean;
  /** Правила партии целиком — из них берётся цена платной проверки. */
  rules: GameRules;
  /** Взведён ли «Ва-банк» — переключатель в меню карты. Состояние интерфейса. */
  vaBanqueArmed: boolean;
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
  /**
   * Идёт ли выбор карты под щит дуэли. Состояние интерфейса, как и
   * `exchangePick`: кнопка «Дуэль» ничего не решает сама, она открывает выбор
   * карты, а объявляет дуэль уже нажатие на карту.
   */
  duelPick: boolean;
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

/**
 * Меню заряженного «Тайного заговора», лежащего в слоте зрителя.
 *
 * Заговор разряжается только на полном заряде, поэтому меню у него появляется
 * ровно тогда, когда удар возможен: в свой ход и на четырёх зарядах. Раньше
 * это была кнопка в правой колонке — но карта лежит на столе, и бить по ней
 * логично нажатием на неё саму, как по любой другой карте.
 */
function chargedPlotMenu(viewer: Player, input: TableViewInput): CardMenuOption[] | null {
  const plot = viewer.activePlot;
  if (plot?.type !== 'Тайный заговор') return null;
  if ((plot.charges ?? 0) < CONSPIRACY_FULL_CHARGE) return null;
  if (input.activePlayerId !== viewer.id) return null;
  if (input.turnPhase !== 'IDLE' || input.pendingAction) return null;

  const hasTokens = viewer.actionTokens >= 1;
  return [
    {
      kind: 'conspiracy',
      hint: 'Ударить по казне соперника или лишить его короны. Вето это уже не отменит',
      label: 'Разыграть',
      tone: 'arcane',
      disabled: !hasTokens,
      spendsToken: true,
      tokenBlocked: !hasTokens,
      reason: hasTokens ? undefined : 'Нет жетонов действия.'
    },
    inspectOption()
  ];
}

/** Меню карты в свой ход. */
function ownTurnMenu(card: GameCard, viewer: Player, input: TableViewInput): CardMenuOption[] {
  const options: CardMenuOption[] = [];
  const hasTokens = viewer.actionTokens >= 1;
  const plot = isPlot(card);
  const instant = isInstant(card);
  const role = !plot && !instant;

  /* «Ва-банк» идёт первым и намеренно.
   *
   * Он не разыгрывается сам — он модификатор чужого розыгрыша, поэтому на
   * своей карте у него только блеф и осмотр, а подключается он вот этим
   * переключателем на ТОЙ карте, которую собираются играть. Взводят его ДО
   * выбора «Разыграть» или «Блеф», и стоять он обязан там же — до них. Без
   * него сыграть роль по номиналу под Ва-банком было нельзя вовсе. */
  if (card !== 'Ва-банк' && holds(viewer.hand, 'Ва-банк')) {
    const vbReason = !hasTokens
      ? 'Нет жетонов действия.'
      : input.hasPlayedRoleThisTurn
        ? 'Роль уже была в этом ходу.'
        : undefined;
    options.push({
      kind: 'vabanque',
      hint: input.vaBanqueArmed
        ? 'Отключить «Ва-банк»: розыгрыш пойдёт обычным'
        : 'Подключить «Ва-банк»: при проверке эффект удвоится, но печатей не будет',
      label: 'Ва-банк',
      tone: 'ember',
      disabled: !!vbReason,
      spendsToken: false,
      tokenBlocked: false,
      reason: vbReason,
      toggle: true,
      active: input.vaBanqueArmed
    });
  }

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
      /* Перенаправление — не щит, а перевод удара на соседа: полноценный ход,
         и стоит он жетона, как любой другой. */
      disabled: !hasTokens,
      spendsToken: true,
      tokenBlocked: !hasTokens,
      reason: noTokens
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
  if (phase === 'under-attack') {
    /* Идёт выбор щита — карта уже не меню, а сама кнопка: нажатие объявляет
       дуэль. Ровно как отмеченная к обмену карта перестаёт быть меню. */
    return input.duelPick ? [] : underAttackMenu(card, viewer, input);
  }
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
          ? 'Обычное действие уже было в этом ходу.'
          : noTokens;
      const bar: BarButton[] = [
        {
          kind: 'court-actions',
          spendsToken: true,
          tokenBlocked: !hasTokens,
          label: 'Обычные действия',
          tone: 'calm',
          disabled: !!courtReason,
          hint: 'Содержание, пир, слух или обмен карт. Оспорить их нельзя',
          reason: courtReason
        }
      ];
      /* Кнопки «Свершить заговор» здесь больше нет: заряженный Заговор
         разыгрывается нажатием на саму карту в слоте интриги. */
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
    case 'under-attack': {
      /* Пока идёт выбор щита, панель молчит: ход за рукой, а отмена живёт
         в баннере над столом — ровно как при обмене карт. */
      if (input.duelPick) return [];

      /* Цена дуэли — настройка партии: с выключенным тумблером щит бесплатен
         и доступен даже при пустых жетонах. */
      const duelCosts = input.rules.duelCostsToken;
      const duelReason = duelCosts && !hasTokens ? noTokens : undefined;
      return [
        {
          kind: 'believe',
          spendsToken: false,
          tokenBlocked: false,
          label: 'Верю',
          tone: 'good',
          disabled: false,
          hint: 'Не оспаривать нападение. Дальше решает остальной двор'
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
        },
        {
          kind: 'duel',
          spendsToken: duelCosts,
          tokenBlocked: !!duelReason,
          label: 'Дуэль',
          tone: 'danger',
          disabled: !!duelReason,
          hint: 'Выставить карту щитом. Обе карты вскроются сразу — согласия нападающего не нужно',
          reason: duelReason
        }
      ];
    }
    case 'veto': {
      /* Одна кнопка: вето кладётся нажатием на саму карту в руке — оно её
         тратит, и решение о карте принимается на карте. Здесь только отказ. */
      const counter = input.isVetoed;
      return [
        {
          kind: 'veto-pass',
          spendsToken: false,
          tokenBlocked: false,
          label: 'Пропустить',
          tone: 'calm',
          disabled: false,
          hint: counter
            ? 'Оставить отмену в силе. Ход пойдёт дальше, когда ответят все'
            : 'Не вмешиваться. Ход пойдёт дальше, когда ответят все'
        }
      ];
    }
    default:
      return [];
  }
}

function phaseOf(input: TableViewInput, viewer: Player): PhaseKind {
  const { turnPhase, pendingAction, activePlayerId, pendingDoubtDoubterId } = input;

  /*
   * Пока идёт открытие партии, у стола нет ни одной фазы.
   *
   * `activePlayerId` проставлен с самого `startGame` — это победитель жребия,
   * — а `turnPhase` всё открытие стоит в `IDLE`. Вместе это давало победителю
   * готовую панель своего хода: «Действия двора» и «Завершить ход» появлялись
   * у него ещё до того, как монетка оторвалась от стола, и он смотрел бросок,
   * уже зная результат. Ходов движок в это время всё равно не принимает.
   */
  if (input.opening) return 'waiting';

  if (pendingDoubtDoubterId) return 'reveal';
  if (turnPhase === 'TARGET_REACTION_WINDOW' && pendingAction?.targetId === viewer.id) {
    return 'under-attack';
  }
  /* Окно вето — такой же опрос, как и окно сомнения: показывается тому, кого
     спрашивают, и ровно до его ответа. Не спрашивают того, чья карта сейчас
     наверху: ни автора собственного действия, ни того, кто только что положил
     вето, — отменять своё же нечего. */
  if (
    turnPhase === 'VETO_WINDOW' &&
    pendingAction &&
    vetoAnswerRequired(
      viewer.id,
      vetoTopActorId(pendingAction.actorId, input.overlayInstant)
    ) &&
    !input.pendingVetoPassedIds.includes(viewer.id)
  ) {
    return 'veto';
  }
  /* Свой ответ дают один раз. Жертва нападения входит в опрос двора с уже
     сказанным «Верю», и показывать ей те же кнопки заново значит спрашивать
     дважды об одном. */
  if (
    turnPhase === 'DOUBT_WINDOW' &&
    pendingAction?.actorId !== viewer.id &&
    !input.pendingDoubtPassedIds.includes(viewer.id)
  ) {
    return 'doubt';
  }
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
      return input.duelPick
        ? 'Выберите карту из руки — она станет вашим щитом.'
        : 'Верю, не верю или дуэль? Ответ один и окончательный.';
    case 'veto':
      if (input.isVetoed) {
        return holdsVeto(viewer)
          ? 'Действие отменено. Снимите отмену встречным вето или пропустите.'
          : 'Действие отменено вето. Пропустите, чтобы двор пошёл дальше.';
      }
      return holdsVeto(viewer)
        ? 'Наложите вето картой из руки или пропустите.'
        : 'Вмешаться нечем — пропустите, чтобы двор пошёл дальше.';
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

  /* Лежащий заговор — не карта руки, но меню у него такое же: он единственная
     карта на столе, по которой игрок действительно ходит. */
  const plotMenu = chargedPlotMenu(viewer, input);
  const plotCardId = plotMenu && viewer.activePlot ? viewer.activePlot.cardId : null;
  if (plotMenu && plotCardId) menus[plotCardId] = plotMenu;

  /* Подпись под тем, что нарисовано. Всё, чего здесь нет, менять картинку не
     имеет права; всё, что здесь есть, обязано её менять. */
  const id = [
    phase,
    title,
    titleName ?? '',
    input.exchangePick ? `pick:${input.exchangePick.join('.')}` : '',
    input.duelPick ? 'duelpick' : '',
    phase === 'veto' ? `vetochain:${input.vetoChain}` : '',
    guidance,
    event,
    bar.map(b => `${b.kind}${b.disabled ? '!' : ''}`).join(','),
    viewerHandIds
      .map(cid =>
        menus[cid]
          .map(o => `${o.kind}${o.disabled ? '!' : ''}${o.active ? '+' : ''}`)
          .join('.')
      )
      .join('|'),
    plotCardId ? `plot:${menus[plotCardId].map(o => `${o.kind}${o.disabled ? '!' : ''}`).join('.')}` : ''
  ].join('~');

  return {
    id,
    phase,
    title,
    titleName,
    guidance,
    event,
    bar,
    viewerHandIds,
    menus
  };
}
