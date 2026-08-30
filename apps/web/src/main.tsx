import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
/* Импорт ради побочного эффекта: модуль на старте кладёт `--ui-scale` на корень,
   и сделать это надо до первого рендера. Стили выше — чтобы было что читать
   обратно (см. `lib/uiScale.ts`). */
import './lib/uiScale.ts';
import Root from './Root.tsx';
import { ToastHost } from './lib/toast';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastHost>
      <Root />
    </ToastHost>
  </StrictMode>,
);
