import { useState } from 'react';
import { Crown, KeyRound, LogIn, Mail, Swords, Users } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Overlay';
import {
  requestMagicLink,
  verifyMagicCode,
  setToken,
  fetchMe,
  type Account
} from './AuthClient';
import { useToast } from '../lib/toast';
import '../styles/screen.css';

type LoginStatus = 'idle' | 'sending' | 'sent' | 'verifying';

export function LandingScreen({ onLoggedIn }: { onLoggedIn: (account: Account) => void }) {
  const [loginOpen, setLoginOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<LoginStatus>('idle');
  const [error, setError] = useState('');
  const toast = useToast();

  const finishLogin = async (token: string) => {
    setToken(token);
    const me = await fetchMe();
    if (!me) throw new Error('session was not accepted');
    onLoggedIn(me.user);
  };

  const requestLogin = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.includes('@') || status === 'sending') return;
    setEmail(normalizedEmail);
    setError('');
    setStatus('sending');
    try {
      const { devToken } = await requestMagicLink(normalizedEmail);
      if (devToken) {
        await finishLogin(devToken);
        return;
      }
      setStatus('sent');
    } catch {
      setStatus('idle');
      toast('Не удалось отправить письмо. Попробуйте ещё раз.');
    }
  };

  const verifyCode = async () => {
    if (code.length !== 6 || status === 'verifying') return;
    setError('');
    setStatus('verifying');
    try {
      await finishLogin(await verifyMagicCode(email, code));
    } catch {
      setStatus('sent');
      setError('Неверный или истёкший код.');
    }
  };

  return (
    <div className="screen landing">
      <main className="landing__content">
        <div className="brand brand--hero">
          <div className="brand__title">
            <span className="brand__rule" />
            <span className="gilded">КИНГСЛЕР</span>
            <span className="brand__rule brand__rule--r" />
          </div>
          <div className="brand__sub">Битва за престол</div>
        </div>

        <section className="landing__hero">
          <span className="eyebrow">Карточная игра для 2–4 претендентов</span>
          <h1>Интриги, блеф и борьба за корону</h1>
          <p>
            Разыгрывайте роли, плетите заговоры и заставляйте соперников сомневаться.
            Побеждает тот, кто первым превратит влияние при дворе в законное право на престол.
          </p>
          <Button tone="gold" size="lg" onClick={() => setLoginOpen(true)}>
            <LogIn size={19} /> Войти и играть
          </Button>
        </section>

        <div className="landing__features">
          <article>
            <Swords size={18} />
            <strong>Блефуйте</strong>
            <span>Заявляйте любую роль — если вам поверят.</span>
          </article>
          <article>
            <Crown size={18} />
            <strong>Боритесь за влияние</strong>
            <span>Копите короны и удержите преимущество до своего хода.</span>
          </article>
          <article>
            <Users size={18} />
            <strong>Играйте как удобно</strong>
            <span>С друзьями онлайн или против королевского двора ботов.</span>
          </article>
        </div>
      </main>

      <Dialog
        open={loginOpen}
        onClose={() => {
          setLoginOpen(false);
          setError('');
        }}
        width={430}
        title="Вход в Kinglier"
        description="Без пароля — по ссылке или коду из письма"
      >
        {status === 'sent' || status === 'verifying' ? (
          <div className="login-form">
            <p className="login-form__copy">
              Письмо отправлено на <strong>{email}</strong>. Откройте ссылку или введите код здесь.
            </p>
            <input
              className="field login-code"
              value={code}
              onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={event => event.key === 'Enter' && void verifyCode()}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              aria-label="Шестизначный код"
              autoFocus
            />
            {error && <p className="login-form__error">{error}</p>}
            <Button
              tone="gold"
              size="lg"
              block
              disabled={code.length !== 6 || status === 'verifying'}
              onClick={verifyCode}
            >
              <KeyRound size={18} /> {status === 'verifying' ? 'Проверяем…' : 'Войти по коду'}
            </Button>
            <Button
              tone="bare"
              size="sm"
              onClick={() => {
                setStatus('idle');
                setCode('');
                setError('');
              }}
            >
              Изменить почту
            </Button>
          </div>
        ) : (
          <div className="login-form">
            <label htmlFor="login-email">Электронная почта</label>
            <input
              id="login-email"
              className="field"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={event => setEmail(event.target.value)}
              onKeyDown={event => event.key === 'Enter' && void requestLogin()}
              autoComplete="email"
              autoFocus
            />
            <Button
              tone="gold"
              size="lg"
              block
              disabled={!email.includes('@') || status === 'sending'}
              onClick={requestLogin}
            >
              <Mail size={18} /> {status === 'sending' ? 'Отправляем…' : 'Получить код и ссылку'}
            </Button>
          </div>
        )}
      </Dialog>
    </div>
  );
}
