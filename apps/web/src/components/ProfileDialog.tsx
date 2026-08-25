import { useState, type FormEvent } from 'react';
import { LogOut, Save, UserRoundPen } from 'lucide-react';
import {
  PROFILE_AVATARS,
  PROFILE_TITLES,
  type ProfileTitle,
  isValidNickname,
  sanitizeNicknameInput
} from '@kinglier/engine/profile';
import { updateProfile, type Account } from '../auth/AuthClient';
import { useToast } from '../lib/toast';
import { Button } from './ui/Button';
import { Dialog } from './ui/Overlay';
import { Select } from './ui/Select';

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

  const trimmed = nickname.trim();
  const isNicknameValid = isValidNickname(trimmed);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!isNicknameValid || saving) return;
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

  const titleOptions = PROFILE_TITLES.map(option => ({
    value: option,
    label: option
  }));

  return (
    <Dialog
      open={open}
      onClose={() => !saving && onClose()}
      width={500}
      title={
        <div className="modal-hero-title">
          <div className="modal-hero-title__badge">
            <UserRoundPen size={20} />
          </div>
          <div className="modal-hero-title__meta">
            <span className="modal-hero-title__eyebrow">Персонализация</span>
            <span className="modal-hero-title__text gilded">Профиль игрока</span>
          </div>
        </div>
      }
    >
      <form className="profile-form" onSubmit={save}>
        {/* Live Preview Card */}
        <div className="profile-preview-card">
          <div className="profile-preview-card__avatar">
            <img src={avatar} alt="" />
          </div>
          <div className="profile-preview-card__info">
            <span className="profile-preview-card__title">{title}</span>
            <span className="profile-preview-card__name">{trimmed || 'Player'}</span>
          </div>
        </div>

        <div className="profile-form__group">
          <label htmlFor="profile-nickname">Имя в игре</label>
          <input
            id="profile-nickname"
            className="field"
            value={nickname}
            onChange={event => setNickname(sanitizeNicknameInput(event.target.value))}
            minLength={3}
            maxLength={12}
            placeholder="Только латинские буквы и цифры"
            autoComplete="nickname"
          />
          <span className="profile-form__hint">
            Только латинские буквы, цифры и максимум один пробел внутри (от 3 до 12 символов)
          </span>
        </div>

        <div className="profile-form__group">
          <label htmlFor="profile-title">Титул</label>
          <Select<ProfileTitle>
            id="profile-title"
            value={title}
            options={titleOptions}
            onChange={setTitle}
          />
        </div>

        <div className="profile-form__group">
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
        </div>

        <div className="profile-form__actions">
          <Button tone="bare" onClick={onLogout} disabled={saving}>
            <LogOut size={16} /> Выйти
          </Button>
          <Button tone="gold" type="submit" disabled={!isNicknameValid || saving}>
            <Save size={16} /> {saving ? 'Сохраняем…' : 'Сохранить'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
