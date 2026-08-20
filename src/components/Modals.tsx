import { useGameStore } from '../engine/GameStore';
import { ALL_ROLES, ALL_PLOTS, ALL_INSTANTS, CARD_INFO } from '../engine/cards';

interface ModalsProps {
  showRulesModal: boolean;
  onCloseRulesModal: () => void;
}

export function Modals({
  showRulesModal,
  onCloseRulesModal
}: ModalsProps) {
  const { 
    players, 
    spyPeekData,
    informantPeekData,
    completeSpyAction,
    closeInformantPeek,
    turnPhase,
    winnerId,
    restartGame
  } = useGameStore();

  const human = players.find(p => !p.isBot);
  if (!human) return null;

  // 1. Spy Peek Modal (Pure instant reveal, no stealing)
  if (turnPhase === 'SPY_PEEK' && spyPeekData) {
    const target = players.find(p => p.id === spyPeekData.targetId);
    const targetCards = spyPeekData.targetCards || ['Наследник', 'Казначей'];

    return (
      <div className="game-modal-overlay">
        <div className="game-modal-content" style={{ maxWidth: '540px' }}>
          <div className="modal-header-title cinzel-font">👁️ Тайный надзор Шпиона</div>
          <div style={{ fontSize: '0.84rem', color: '#cbd5e1', textAlign: 'center', marginBottom: '14px' }}>
            Вы тайно взглянули на обе карты игрока <strong style={{ color: 'var(--gold-light)' }}>{target?.name}</strong>. Вы получили стратегическую информацию для будущих проверок и споров:
          </div>

          {/* Target's 2 Cards View */}
          <div style={{ display: 'grid', gridTemplateColumns: targetCards.length > 1 ? '1fr 1fr' : '1fr', gap: '12px', marginBottom: '16px' }}>
            {targetCards.map((cardRole, idx) => {
              const info = CARD_INFO[cardRole] || { badge: '🂠', name: cardRole, shortDescription: '', gradient: '', borderColor: '#d97706' };
              return (
                <div 
                  key={idx}
                  style={{
                    background: info.gradient || 'linear-gradient(180deg, #1e293b, #0f172a)',
                    border: `2px solid ${info.borderColor || '#fbbf24'}`,
                    borderRadius: '14px',
                    padding: '14px 10px',
                    textAlign: 'center',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--gold-light)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>
                      Карта #{idx + 1} у {target?.name}
                    </div>
                    <div style={{ fontSize: '2.4rem', marginBottom: '4px' }}>{info.badge}</div>
                    <div className="cinzel-font" style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--gold-light)' }}>
                      {info.name}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#e2e8f0', marginTop: '6px', lineHeight: 1.25 }}>
                      {info.shortDescription}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '12px' }}>
            <button 
              type="button"
              className="action-deck-btn btn-gold" 
              style={{ width: '100%', padding: '12px', fontSize: '0.84rem' }}
              onClick={() => completeSpyAction()}
            >
              Понятно (запомнить карты)
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Informant Peek Modal (Сеть информаторов перехватила карту)
  if (turnPhase === 'INFORMANT_PEEK' && informantPeekData) {
    const target = players.find(p => p.id === informantPeekData.targetId);
    const info = CARD_INFO[informantPeekData.newCard];

    return (
      <div className="game-modal-overlay">
        <div className="game-modal-content" style={{ maxWidth: '440px', textAlign: 'center' }}>
          <div className="modal-header-title cinzel-font">👁️ Сеть информаторов перехватила карту!</div>
          <div style={{ fontSize: '0.82rem', color: '#cbd5e1', marginBottom: '14px' }}>
            Ваши шпионы донесли: соперник <strong style={{ color: 'var(--gold-light)' }}>{target?.name}</strong> получил новую карту из колоды:
          </div>

          <div 
            style={{
              background: info.gradient,
              border: `2px solid ${info.borderColor}`,
              borderRadius: '14px',
              padding: '16px',
              maxWidth: '220px',
              margin: '0 auto 16px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)'
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '4px' }}>{info.badge}</div>
            <div className="cinzel-font" style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--gold-light)' }}>
              {info.name}
            </div>
            <div style={{ fontSize: '0.74rem', color: '#e2e8f0', marginTop: '6px' }}>
              {info.shortDescription}
            </div>
          </div>

          <button
            type="button"
            className="action-deck-btn btn-gold"
            style={{ width: '100%', padding: '10px' }}
            onClick={closeInformantPeek}
          >
            Понятно (запомнить)
          </button>
        </div>
      </div>
    );
  }

  // 3. Victory / Game Over Modal
  if (turnPhase === 'GAME_OVER') {
    const isDraw = winnerId === 'draw';
    const winner = isDraw ? null : players.find(p => p.id === winnerId);
    const isHumanWinner = winner?.id === human.id;

    // Leaderboard sorted by Crowns -> Seals -> Gold
    const leaderboard = [...players].sort((a, b) => {
      if (b.favor !== a.favor) return b.favor - a.favor;
      if (b.seals !== a.seals) return b.seals - a.seals;
      return b.gold - a.gold;
    });

    return (
      <div className="game-modal-overlay">
        <div className="game-modal-content" style={{ textAlign: 'center', maxWidth: '520px' }}>
          <div style={{ fontSize: '4rem', marginBottom: '4px' }}>
            {isDraw ? '⚖️' : isHumanWinner ? '👑' : '🏆'}
          </div>
          <div className="modal-header-title cinzel-font gold-gradient-text" style={{ fontSize: '1.6rem' }}>
            {isDraw ? 'НИЧЬЯ — ПРЕСТОЛ ПУСТ!' : isHumanWinner ? 'ВЫ КОРОНОВАНЫ!' : 'КОРОНАЦИЯ СОСТОЯЛАСЬ!'}
          </div>
          <div style={{ fontSize: '0.88rem', color: '#cbd5e1', marginTop: '4px', lineHeight: 1.4 }}>
            {isDraw 
              ? 'Претенденты набрали абсолютно равное влияние. Королевство ждет новую дуэль!'
              : <>Победитель королевского двора: <strong style={{ color: 'var(--gold-light)' }}>{winner?.name}</strong>!</>}
          </div>

          {/* Leaderboard Table */}
          <div style={{ marginTop: '16px', background: 'rgba(15, 23, 42, 0.85)', borderRadius: '10px', padding: '8px 12px', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--gold-light)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>
              Итоговое влияние двора:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {leaderboard.map((p, rank) => {
                const isTop = rank === 0;
                return (
                  <div 
                    key={p.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      background: isTop ? 'rgba(234, 179, 8, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                      border: isTop ? '1px solid #eab308' : '1px solid transparent',
                      fontSize: '0.76rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontWeight: 800, width: '16px' }}>{rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `${rank + 1}.`}</span>
                      <span style={{ fontWeight: isTop ? 800 : 600, color: p.id === human.id ? '#93c5fd' : '#fff' }}>
                        {p.name} {p.id === human.id ? '(Вы)' : ''}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <span style={{ color: 'var(--gold-light)', fontWeight: 800 }}>👑 {p.favor}</span>
                      <span style={{ color: '#c084fc', fontWeight: 700 }}>⚜️ {p.seals}</span>
                      <span style={{ color: '#fbbf24' }}>💰 {p.gold}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <button className="action-deck-btn btn-gold" style={{ marginTop: '16px', padding: '12px' }} onClick={restartGame}>
            Сыграть новую партию
          </button>
        </div>
      </div>
    );
  }

  // 4. Rules Modal
  if (showRulesModal) {
    return (
      <div className="game-modal-overlay" onClick={onCloseRulesModal}>
        <div className="game-modal-content" style={{ maxWidth: '680px', maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
          <div className="modal-header-title cinzel-font">Свод законов двора Kinglier</div>
          
          <div style={{ fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.45, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <strong style={{ color: 'var(--gold-light)' }}>👑 Единая колода из 39 карт и победа:</strong> Колода состоит из 18 карт Ролей (6 ролей × 3), 8 Интриг 🎴 (4 типа × 2) и 13 Инстантов ⚡ (Право вето × 5, остальные 4 типа × 2). Побеждает тот, кто первым удержит 6 👑 корон полный круг. За разоблачения и победы в спорах начисляются <span style={{ color: '#c084fc' }}>⚜️ печати</span> (<strong>2 ⚜️ = 1 👑</strong>).
            </div>

            <div>
              <strong style={{ color: '#38bdf8' }}>⚡ 3 Фазы Хода и 2 Жетона Действия:</strong>
              <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                <li><strong>Фаза 1 (Утро):</strong> Восполнение до 2 ⚡ + срабатывание эффектов круга («Приём»).</li>
                <li><strong>Фаза 2 (Обычное действие, макс. 1):</strong> Содержание, Пир, Слух, Смена карты (1 ⚡) или пропуск фазы. Вернуться к ней после перехода к картам нельзя!</li>
                <li><strong>Фаза 3 (Розыгрыш карт):</strong> Интрига 🎴 (макс. 1, 1 ⚡), Роль 👑 (макс. 1, 1 ⚡), Инстанты ⚡ (по 1 ⚡).</li>
                <li><strong>Добор карт:</strong> Карты из колоды добираются в руку (до 2 штук) <strong>только в конце хода</strong>!</li>
              </ul>
            </div>

            <div>
              <strong style={{ color: '#fef08a' }}>🎭 Блеф любой картой:</strong> Любую карту из руки (даже Интригу или Инстант) можно выложить взакрытую и заявить как любую из 6 Ролей! При проверке карта вскрывается и уходит в сброс.
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '8px', fontWeight: 'bold', color: 'var(--gold-light)' }}>
              6 Ролей Двора (18 карт):
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              {ALL_ROLES.map(r => (
                <div key={r} style={{ fontSize: '0.72rem', background: 'rgba(255,255,255,0.05)', padding: '6px 8px', borderRadius: '6px' }}>
                  <strong style={{ color: 'var(--gold-light)' }}>{CARD_INFO[r].badge} {r}:</strong> {CARD_INFO[r].shortDescription}
                </div>
              ))}
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '8px', fontWeight: 'bold', color: '#facc15' }}>
              4 Интриги 🎴 (8 карт):
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              {ALL_PLOTS.map(p => (
                <div key={p} style={{ fontSize: '0.72rem', background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.3)', padding: '6px 8px', borderRadius: '6px' }}>
                  <strong style={{ color: '#facc15' }}>{CARD_INFO[p].badge} {p}:</strong> {CARD_INFO[p].shortDescription}
                </div>
              ))}
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '8px', fontWeight: 'bold', color: '#c084fc' }}>
              5 Инстантов ⚡ (13 карт):
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              {ALL_INSTANTS.map(i => (
                <div key={i} style={{ fontSize: '0.72rem', background: 'rgba(192, 132, 252, 0.1)', border: '1px solid rgba(192, 132, 252, 0.3)', padding: '6px 8px', borderRadius: '6px' }}>
                  <strong style={{ color: '#c084fc' }}>{CARD_INFO[i].badge} {i}:</strong> {CARD_INFO[i].shortDescription}
                </div>
              ))}
            </div>
          </div>

          <button className="close-modal-btn" onClick={onCloseRulesModal} style={{ marginTop: '14px' }}>Понятно</button>
        </div>
      </div>
    );
  }

  return null;
}
