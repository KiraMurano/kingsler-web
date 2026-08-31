import { useRef, useState } from 'react';
import { Crown, KeyRound, LogIn, Mail, ChevronDown, Sparkles } from 'lucide-react';
import { Brand } from '../components/Brand';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Overlay';
import { CodeInput } from '../components/ui/CodeInput';
import { CardFanShowcase } from '../components/CardFanShowcase';
import {
  requestMagicLink,
  verifyMagicCode,
  setToken,
  fetchMe,
  type Account
} from './AuthClient';
import { useToast } from '../lib/toast';
import { DEFAULT_RULES } from '@kinglier/engine/rules';
import '../styles/screen.css';

type LoginStatus = 'idle' | 'sending' | 'sent' | 'verifying';

/**
 * Локальная заглушка входа — чтобы окно с кодом было чем открыть.
 *
 * В разработке сервер отдаёт `devToken` вместо письма (слать некуда), и вход
 * происходит сразу же — окно с кодом при этом не показывается вовсе, то есть
 * посмотреть на него без почтового ящика нельзя. Заглушка придерживает этот
 * токен, показывает окно и принимает любые шесть цифр, а входит по токену.
 *
 * `import.meta.env.DEV` — не проверка во время работы, а константа времени
 * сборки: в продовой сборке она `false`, ветка ниже вырезается вместе с телом,
 * и попасть на боевой сайт не может. Проверка кода в проде не меняется ни на
 * строчку — меняется только внешний вид поля.
 */
const DEV_LOGIN_STUB = import.meta.env.DEV;

const GAME_HIGHLIGHTS = [
  {
    art: '/assets/cards/joker.webp',
    title: 'Абсолютный блеф',
    text: 'Кладите на стол любую карту рубашкой вверх и называйте её любой ролью. Поверят — действие сработает.'
  },
  {
    art: '/assets/cards/duelist.webp',
    title: 'Дуэли и проверки',
    text: 'Усомнитесь в чужих словах или бросьте вызов на дуэль со скрытыми ставками, чтобы сбить фаворита.'
  },
  {
    art: '/assets/cards/heir.webp',
    title: 'Битва за корону',
    text: `Накопите ${DEFAULT_RULES.crownsToWin} корон Благосклонности и удержите их целый круг, отражая атаки соперников.`
  }
] as const;

export function LandingScreen({ onLoggedIn }: { onLoggedIn: (account: Account) => void }) {
  const [loginOpen, setLoginOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<LoginStatus>('idle');
  const [error, setError] = useState('');
  const toast = useToast();
  /* Токен из ответа сервера, придержанный заглушкой до ввода любых шести цифр. */
  const devTokenRef = useRef<string | null>(null);

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
        if (DEV_LOGIN_STUB) {
          devTokenRef.current = devToken;
          setStatus('sent');
          return;
        }
        await finishLogin(devToken);
        return;
      }
      setStatus('sent');
    } catch {
      /* Даже с лежащим сервером окно должно открыться — смотреть на него это
         и есть смысл заглушки. Войти будет нечем, о чём скажет проверка. */
      if (DEV_LOGIN_STUB) {
        devTokenRef.current = null;
        setStatus('sent');
        return;
      }
      setStatus('idle');
      toast('Не удалось отправить письмо. Попробуйте ещё раз.');
    }
  };

  const verifyCode = async (entered = code) => {
    if (entered.length !== 6 || status === 'verifying') return;
    setError('');
    setStatus('verifying');
    try {
      if (DEV_LOGIN_STUB) {
        const token = devTokenRef.current;
        if (!token) {
          setStatus('sent');
          setError('Заглушка разработки: сервер не ответил, входить нечем — но окно смотреть можно.');
          return;
        }
        await finishLogin(token);
        return;
      }
      await finishLogin(await verifyMagicCode(email, entered));
    } catch {
      setStatus('sent');
      setError('Неверный или истёкший код.');
      /* Стираем набранное: исправлять одну цифру в неверном коде обычно
         бессмысленно, а пустой ряд сразу готов принять новый. */
      setCode('');
    }
  };

  const scrollToCards = () => {
    const el = document.getElementById('cards-showcase');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="landing-page">
      {/* Top Floating Nav Bar */}
      <header className="landing-nav">
        <div className="landing-nav__brand">
          <Brand size="nav" />
        </div>
        <Button tone="bare" size="sm" onClick={() => setLoginOpen(true)}>
          <LogIn size={15} /> Войти
        </Button>
      </header>

      {/* BLOCK 1: HERO / STARTER SECTION */}
      <section className="landing-hero-block">
        <div className="landing-hero-block__backdrop-glow" />

        <div className="landing-hero-block__inner">
          <div className="landing-badge">
            <Sparkles size={14} className="landing-badge__icon" />
            <span>Карточная игра о дворцовых интригах и блефе</span>
          </div>

          <Brand />

          <h1 className="landing-hero-block__headline">
            Правда — лишь то, <br />
            во что поверят остальные
          </h1>

          <p className="landing-hero-block__story">
            Каждый ход вы разыгрываете карты в закрытую и можете назвать себя кем угодно — коварным
            шантажистом, благородным рыцарем или королевским казначеем. Если вам поверят, действие
            сработает. Если поймают на лжи — придётся платить за дерзость. Плетите интриги, проверяйте
            блеф соперников и удержите {DEFAULT_RULES.crownsToWin} корон, чтобы короновать себя королём.
          </p>

          <div className="landing-hero-block__actions">
            <Button tone="gold" size="lg" onClick={() => setLoginOpen(true)}>
              <LogIn size={18} /> Начать схватку за корону
            </Button>
            <Button tone="bare" size="lg" onClick={scrollToCards}>
              Колода <ChevronDown size={17} />
            </Button>
          </div>

          {/* 3 Core Highlights — illustrated chapters, not icon-in-a-box */}
          <div className="landing-highlights">
            {GAME_HIGHLIGHTS.map(({ title, text, art }) => (
              <article
                className="landing-highlight"
                key={title}
                style={{ '--highlight-art': `url(${art})` } as React.CSSProperties}
              >
                <div className="landing-highlight__body">
                  <strong>{title}</strong>
                  <span>{text}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="section-seam" aria-hidden="true" />

      {/* BLOCK 2: INTERACTIVE FAN OF CARDS & SHOWCASE */}
      <CardFanShowcase onOpenLogin={() => setLoginOpen(true)} />

      {/* Auth Dialog */}
      <Dialog
        open={loginOpen}
        onClose={() => {
          setLoginOpen(false);
          setError('');
        }}
        width={440}
        title={
          status === 'sent' || status === 'verifying' ? (
            <div className="modal-hero-title">
              <div className="modal-hero-title__badge">
                <KeyRound size={20} />
              </div>
              <div className="modal-hero-title__meta">
                <span className="modal-hero-title__eyebrow">Подтверждение</span>
                <span className="modal-hero-title__text gilded">Введите код</span>
              </div>
            </div>
          ) : (
            <div className="modal-hero-title">
              <div className="modal-hero-title__badge">
                <Crown size={20} />
              </div>
              <div className="modal-hero-title__meta">
                <span className="modal-hero-title__eyebrow">Кингслер</span>
                <span className="modal-hero-title__text gilded">Вход в игру</span>
              </div>
            </div>
          )
        }
      >
        {status === 'sent' || status === 'verifying' ? (
          <form className="login-form" onSubmit={e => { e.preventDefault(); void verifyCode(); }}>
            <p className="login-form__copy">
              Код отправлен на <strong>{email}</strong>
            </p>
            <div className="login-code-wrapper">
              <CodeInput
                value={code}
                onChange={setCode}
                /* Шестая цифра — это и есть «отправить»: лишнее нажатие на
                   кнопку тут ничего не решает, а кнопка остаётся для тех, кто
                   вставил код и ждёт явного действия. */
                onComplete={next => void verifyCode(next)}
                disabled={status === 'verifying'}
                invalid={!!error}
                autoFocus
              />
            </div>
            {error && <p className="login-form__error">{error}</p>}
            <Button
              tone="gold"
              size="lg"
              block
              type="submit"
              disabled={code.length !== 6 || status === 'verifying'}
            >
              <KeyRound size={18} /> {status === 'verifying' ? 'Проверяем…' : 'Войти'}
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
          </form>
        ) : (
          <form className="login-form" onSubmit={e => { e.preventDefault(); void requestLogin(); }}>
            <div className="login-form__group">
              <label htmlFor="login-email">Электронная почта</label>
              <input
                id="login-email"
                className="field"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={event => setEmail(event.target.value)}
                autoComplete="email"
                autoFocus
              />
            </div>
            <Button
              tone="gold"
              size="lg"
              block
              type="submit"
              disabled={!email.includes('@') || status === 'sending'}
            >
              <Mail size={18} /> {status === 'sending' ? 'Отправляем…' : 'Получить код'}
            </Button>
          </form>
        )}
      </Dialog>
    </div>
  );
}
