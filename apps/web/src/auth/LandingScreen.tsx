import { useState } from 'react';
import { Mail } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { requestMagicLink, setToken, fetchMe, type Account } from './AuthClient';
import { useToast } from '../lib/toast';
import '../styles/screen.css';

export function LandingScreen({ onLoggedIn }: { onLoggedIn: (account: Account) => void }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const toast = useToast();

  const submit = async () => {
    if (!email.includes('@') || status === 'sending') return;
    setStatus('sending');
    try {
      const { devToken } = await requestMagicLink(email.trim().toLowerCase());
      if (devToken) {
        setToken(devToken);
        const me = await fetchMe();
        if (me) onLoggedIn(me.user);
        return;
      }
      setStatus('sent');
    } catch {
      setStatus('idle');
      toast('Не удалось отправить письмо. Попробуйте ещё раз.');
    }
  };

  return (
    <div className="screen">
      <div className="screen__panel">
        <div className="brand brand--hero">
          <div className="brand__title">
            <span className="brand__rule" />
            <span className="gilded">КИНГСЛЕР</span>
            <span className="brand__rule brand__rule--r" />
          </div>
          <div className="brand__sub">Битва за престол</div>
        </div>

        <div className="dialog__panel lobbycard">
          {status === 'sent' ? (
            <p className="landing__sent">
              Письмо со ссылкой для входа отправлено на {email}. Проверьте почту (и папку «Спам»).
            </p>
          ) : (
            <>
              <input
                className="field"
                type="email"
                placeholder="Ваша почта"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                autoFocus
              />
              <Button
                tone="gold"
                size="lg"
                block
                disabled={!email.includes('@') || status === 'sending'}
                onClick={submit}
              >
                <Mail size={18} /> Получить ссылку для входа
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
