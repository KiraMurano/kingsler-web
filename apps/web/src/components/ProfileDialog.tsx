import { useState, type FormEvent } from 'react';
import { LogOut, Save } from 'lucide-react';
import { PROFILE_AVATARS, PROFILE_TITLES } from '@kinglier/engine/profile';
import { updateProfile, type Account } from '../auth/AuthClient';
import { useToast } from '../lib/toast';
import { Button } from './ui/Button';
import { Dialog } from './ui/Overlay';

interface ProfileDialogProps {
  open: boolean;
  account: Account;
  onClose: () => void;
  onSaved: (account: Account) => void;
  onLogout: () => void;
}

export function ProfileDialog({ open, account, onClose, onSaved, onLogout }: ProfileDialogProps) {
  const [nickname, setNickname] = useState(account.nickname);
  const [avatar, setAvatar] = useState(account.avatar);
  const [title, setTitle] = useState(account.title);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = nickname.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await updateProfile({ nickname: trimmed, avatar, title });
      onSaved({ ...account, nickname: trimmed, avatar, title });
      onClose();
    } catch {
      toast('Не удалось сохранить профиль.');
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !saving && onClose()}
      width={500}
      title="Профиль"
      description="Как вас увидит королевский двор"
    >
      <form className="profile-form" onSubmit={save}>
        <label htmlFor="profile-nickname">Имя</label>
        <input
          id="profile-nickname"
          className="field"
          value={nickname}
          onChange={event => setNickname(event.target.value)}
          maxLength={24}
          autoComplete="nickname"
        />

        <span className="profile-form__label">Аватар</span>
        <div className="profile-avatars">
          {PROFILE_AVATARS.map((option, index) => (
            <button
              key={option}
              type="button"
              className={`profile-avatar ${avatar === option ? 'profile-avatar--selected' : ''}`}
              onClick={() => setAvatar(option)}
              aria-label={`Выбрать аватар ${index + 1}`}
              aria-pressed={avatar === option}
            >
              <img src={option} alt="" />
            </button>
          ))}
        </div>

        <span className="profile-form__label">Титул</span>
        <div className="profile-titles">
          {PROFILE_TITLES.map(option => (
            <button
              key={option}
              type="button"
              className={`profile-title ${title === option ? 'profile-title--selected' : ''}`}
              onClick={() => setTitle(option)}
              aria-pressed={title === option}
            >
              {option}
            </button>
          ))}
        </div>

        <div className="profile-form__actions">
          <Button tone="bare" onClick={onLogout} disabled={saving}>
            <LogOut size={16} /> Выйти
          </Button>
          <Button tone="gold" type="submit" disabled={!nickname.trim() || saving}>
            <Save size={16} /> {saving ? 'Сохраняем…' : 'Сохранить'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
