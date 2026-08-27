/** Временная заглушка. Настоящая полоска — в Задаче 10 плана. */
import React from 'react';

export const VetoTimerBar: React.FC<{ deadlineAt: number }> = () => (
  <div className="vetobar">
    <div className="vetobar__head">
      <span className="vetobar__label">Окно вето</span>
    </div>
  </div>
);
