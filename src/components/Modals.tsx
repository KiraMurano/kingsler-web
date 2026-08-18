import { useGameStore } from '../engine/GameStore';
import { ALL_ROLES, ROLE_INFO } from '../engine/roles';

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
    completeSpyAction,
    turnPhase,
    winnerId,
    restartGame
  } = useGameStore();

  const human = players.find(p => !p.isBot);

  if (!human) return null;

  // 5. Spy Peek Modal (Human interactive action choice for both cards)
  if (turnPhase === 'SPY_PEEK' && spyPeekData) {
    const target = players.find(p => p.id === spyPeekData.targetId);
    const targetCards = spyPeekData.targetCards || ['Наследник', 'Казначей'];

    return (
      <div className="game-modal-overlay">
        <div className="game-modal-content" style={{ maxWidth: '580px' }}>
          <div className="modal-header-title cinzel-font">👁️ Тайное расследование Шпиона</div>
          <div style={{ fontSize: '0.84rem', color: '#cbd5e1', textAlign: 'center', marginBottom: '14px' }}>
            Вы тайно взглянули на обе карты игрока <strong style={{ color: 'var(--gold-light)' }}>{target?.name}</strong>. Вы можете забрать одну из них себе (вместо своего Шпиона), либо просто оставить их и взять новую карту из колоды:
          </div>

          {/* Target's 2 Cards View */}
          <div style={{ display: 'grid', gridTemplateColumns: targetCards.length > 1 ? '1fr 1fr' : '1fr', gap: '12px', marginBottom: '16px' }}>
            {targetCards.map((cardRole, idx) => {
              const info = ROLE_INFO[cardRole] || { badge: '🂠', name: cardRole, shortDescription: '', gradient: '', borderColor: '#d97706' };
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

                  <button
                    type="button"
                    className="action-deck-btn btn-gold"
                    style={{ marginTop: '12px', padding: '8px 4px', fontSize: '0.76rem', fontWeight: 800 }}
                    onClick={() => completeSpyAction(idx)}
                  >
                    Забрать карту #{idx + 1} себе
                  </button>
                </div>
              );
            })}
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '12px' }}>
            <button 
              type="button"
              className="action-deck-btn btn-blue" 
              style={{ width: '100%', padding: '12px', fontSize: '0.84rem' }}
              onClick={() => completeSpyAction(null)}
            >
              Не забирать карты (сбросить Шпиона и взять из колоды)
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 6. Victory / Game Over Modal
  if (turnPhase === 'GAME_OVER') {
    const isDraw = winnerId === 'draw';
    const winner = isDraw ? null : players.find(p => p.id === winnerId);
    const isHumanWinner = winner?.id === human.id;

    return (
      <div className="game-modal-overlay">
        <div className="game-modal-content" style={{ textAlign: 'center', maxWidth: '480px' }}>
          <div style={{ fontSize: '4.5rem', marginBottom: '8px' }}>
            {isDraw ? '⚖️' : isHumanWinner ? '👑' : '💀'}
          </div>
          <div className="modal-header-title cinzel-font gold-gradient-text" style={{ fontSize: '1.8rem' }}>
            {isDraw ? 'НИЧЬЯ — ПРЕСТОЛ ПУСТ!' : isHumanWinner ? 'ВЫ КОРОНОВАНЫ!' : 'ИГРА ОКОНЧЕНА'}
          </div>
          <div style={{ fontSize: '0.95rem', color: '#cbd5e1', marginTop: '8px', lineHeight: 1.45 }}>
            {isDraw 
              ? 'Последние претенденты одновременно пали в позоре при взаимном блефе. В королевстве воцарилась смута!'
              : <>Победитель королевского двора: <strong>{winner?.name}</strong>!</>}
          </div>

          <button className="action-deck-btn btn-gold" style={{ marginTop: '20px', padding: '12px' }} onClick={restartGame}>
            Сыграть новую партию
          </button>
        </div>
      </div>
    );
  }

  // 7. Rules Modal
  if (showRulesModal) {
    return (
      <div className="game-modal-overlay" onClick={onCloseRulesModal}>
        <div className="game-modal-content" style={{ maxWidth: '640px' }} onClick={e => e.stopPropagation()}>
          <div className="modal-header-title cinzel-font">Свод законов и правил двора</div>
          
          <div style={{ fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.45, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <strong style={{ color: 'var(--gold-light)' }}>👑 Коронация и победа:</strong> Набрать 5 корон Благосклонности и удержать их до начала своего следующего хода (или остаться единственным выжившим). <span style={{ color: '#fef08a' }}>Внимание: победную 5-ю корону нельзя купить за монеты на Пиру — её можно получить только по праву крови («Наследник») или украсть («Шантажист»)!</span>
            </div>
            <div>
              <strong style={{ color: 'var(--red-heart)' }}>❤️ Репутация:</strong> 3 жизни. Теряются за пойманную ложь или ложные обвинения. При 0 ❤️ — изгнание со двора! Можно восстанавливать обычным действием (5 💰 = +1 ❤️, макс. 3 ❤️).
            </div>
            <div>
              <strong style={{ color: '#60a5fa' }}>🎭 Главное правило блефа:</strong> Вы можете заявлять абсолютно любую роль. Ваши карты в руке — это страховка на случай проверки «Не верю!».
            </div>
            <div>
              <strong style={{ color: '#f87171' }}>🛑 Проверка останавливает действие:</strong> Любая проверка («Не верю!») останавливает и отменяет действие карты, даже если заявлялась чистая правда! Действие роли успешно совершается только если никто не усомнился.
            </div>
            <div>
              <strong style={{ color: '#a78bfa' }}>⚔️ Сброс карт после розыгрыша:</strong> После розыгрыша заявленная карта в любом случае уходит в сброс (игрок берет новую из колоды), даже если она не проверялась. Когда колода заканчивается, сброс перемешивается.
            </div>
            
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '8px', fontWeight: 'bold', color: 'var(--gold-light)' }}>
              8 Ролей Двора:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {ALL_ROLES.map(r => (
                <div key={r} style={{ fontSize: '0.74rem', background: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: '8px' }}>
                  <strong style={{ color: 'var(--gold-light)' }}>{ROLE_INFO[r].badge} {r}:</strong> {ROLE_INFO[r].fullDescription}
                </div>
              ))}
            </div>
          </div>

          <button className="close-modal-btn" onClick={onCloseRulesModal}>Понятно</button>
        </div>
      </div>
    );
  }

  return null;
}
