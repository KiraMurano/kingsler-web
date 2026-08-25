import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import Root from './Root.tsx';
import { ToastHost } from './lib/toast';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastHost>
      <Root />
    </ToastHost>
  </StrictMode>,
);
