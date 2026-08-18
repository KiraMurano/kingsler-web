import { useState } from 'react';
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
  const [spyCardToSwapIndex, setSpyCardToSwapIndex] = useState<number>(0);

  if (!human) return null;

  // 5. Spy Peek Modal (Human interactive action choice)
  if (turnPhase === 'SPY_PEEK' && spyPeekData) {
    const target = players.find(p => p.id === spyPeekData.targetId);
    const info = ROLE_INFO[spyPeekData.seenRole];

    return (
      <div className="game-modal-overlay">
        <div className="game-modal-content" style={{ maxWidth: '500px' }}>
          <div className="modal-header-title cinzel-font">👁️ Тайное расследование Шпиона</div>
          <div style={{ fontSize: '0.82rem', color: '#cbd5e1', textAlign: 'center' }}>
            Вы тайно взглянули на карту игрока <strong style={{ color: 'var(--gold-light)' }}>{target?.name}</strong>:
          </div>

          {/* Secret Card View */}
          <div style={{
            background: info.gradient,
            border: `2px solid ${info.borderColor}`,
            borderRadius: '14px',
            padding: '16px',
            textAlign: 'center',
            boxShadow: '0 10px 30px rgba(0,0,0,0.8)'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '4px' }}>{info.badge}</div>
            <div className="cinzel-font" style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--gold-light)' }}>
              {info.name}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#e2e8f0', marginTop: '6px' }}>
              {info.shortDescription}
            </div>
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '12px' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--gold-light)', marginBottom: '8px', textAlign: 'center' }}>
              Желаете заменить одну свою карту случайной из колоды?
            </div>
            
            {/* Visual cards in human's hand */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
              {human.hand.map((card, idx) => {
                const cardInfo = ROLE_INFO[card];
                const isSelected = spyCardToSwapIndex === idx;

                return (
                  <button
                    key={idx}
                    className="role-select-card-desktop"
                    style={{
                      flex: 1,
                      background: isSelected ? 'rgba(245, 158, 11, 0.25)' : 'rgba(15, 23, 42, 0.8)',
                      borderColor: isSelected ? 'var(--gold-light)' : 'rgba(245, 158, 11, 0.3)',
                      boxShadow: isSelected ? '0 0 14px rgba(245, 158, 11, 0.4)' : undefined,
                      padding: '10px 8px',
                      alignItems: 'center',
                      textAlign: 'center'
                    }}
                    onClick={() => setSpyCardToSwapIndex(idx)}
                  >
                    <span style={{ fontSize: '0.65rem', color: 'var(--gold-light)', fontWeight: 'bold' }}>
                      {isSelected ? '✓ ЗАМЕНИТЬ ЭТУ' : `Карта ${idx + 1}`}
                    </span>
                    <span style={{ fontSize: '1.6rem', margin: '2px 0' }}>{cardInfo?.badge}</span>
                    <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#fff' }}>{card}</span>
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                className="action-deck-btn btn-gold" 
                style={{ flex: 1, padding: '10px' }}
                onClick={() => completeSpyAction(true, spyCardToSwapIndex)}
              >
                Заменить выбранную карту
              </button>
              <button 
                className="action-deck-btn btn-blue" 
                style={{ flex: 1, padding: '10px' }}
                onClick={() => completeSpyAction(false)}
              >
                Оставить свои карты
              </button>
            </div>
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
              <strong style={{ color: 'var(--gold-light)' }}>👑 Коронация и победа:</strong> Набрать 7 корон Благосклонности и удержать их до начала своего следующего хода (или остаться единственным выжившим). <span style={{ color: '#fef08a' }}>Внимание: победную 7-ю корону нельзя купить за монеты на Пиру — её можно получить только по праву крови («Наследник») или украсть («Шантажист»)!</span>
            </div>
            <div>
              <strong style={{ color: 'var(--red-heart)' }}>❤️ Репутация:</strong> 3 жизни. Теряются за пойманную ложь или ложные обвинения. При 0 ❤️ — изгнание со двора!
            </div>
            <div>
              <strong style={{ color: '#60a5fa' }}>🎭 Главное правило блефа:</strong> Вы можете заявлять абсолютно любую роль. Ваши карты в руке — это страховка на случай проверки «Не верю!».
            </div>
            <div>
              <strong style={{ color: '#a78bfa' }}>⚔️ Сброс карт и перемешивание колоды:</strong> Сыгранные, вскрытые при проверках и замененные карты **отправляются в сброс (кладбище)**, а не замешиваются сразу обратно. Игроки могут следить за вышедшими картами в Своде ролей (справа). **Как только карты в колоде заканчиваются, весь сброс тщательно перемешивается и становится новой колодой!**
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
