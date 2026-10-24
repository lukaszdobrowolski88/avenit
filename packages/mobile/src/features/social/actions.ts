import { Alert } from 'react-native';
import { postPermissions } from '@avenit/shared/src/lib/social.js';
import { toast } from '../../lib/toast';
import { showError } from '../../lib/errors';
import { socialApi, type SocialAccess, type SocialPost } from './api';
import { fmtWhen } from './components/ui';

export type PostAction = 'edit' | 'approve' | 'reject' | 'publishNow' | 'unschedule' | 'retry' | 'duplicate' | 'delete';

export interface ActionItem { key: PostAction; label: string; danger?: boolean }

export const permsFor = (post: SocialPost, access: SocialAccess, email: string) =>
  postPermissions(post, access, email) as Record<'edit' | 'approve' | 'reject' | 'unschedule' | 'publishNow' | 'retry' | 'duplicate' | 'delete' | 'move', boolean>;

// Pozycje menu posta — te same reguły co web (shared/lib/social.js → postPermissions).
export const actionItems = (post: SocialPost, access: SocialAccess, email: string): ActionItem[] => {
  const p = permsFor(post, access, email);
  return [
    p.edit ? { key: 'edit' as const, label: 'Edytuj' } : null,
    p.approve ? { key: 'approve' as const, label: 'Zatwierdź' } : null,
    p.reject ? { key: 'reject' as const, label: 'Odeślij do poprawy' } : null,
    p.publishNow ? { key: 'publishNow' as const, label: 'Opublikuj teraz' } : null,
    p.unschedule ? { key: 'unschedule' as const, label: post.status === 'scheduled' ? 'Wstrzymaj (do szkiców)' : 'Wycofaj do szkiców' } : null,
    p.retry ? { key: 'retry' as const, label: 'Ponów publikację' } : null,
    p.duplicate ? { key: 'duplicate' as const, label: 'Duplikuj' } : null,
    p.delete ? { key: 'delete' as const, label: 'Usuń', danger: true } : null,
  ].filter(Boolean) as ActionItem[];
};

const confirm = (title: string, message: string, ok: string, destructive = false) =>
  new Promise<boolean>((resolve) => {
    Alert.alert(title, message, [
      { text: 'Anuluj', style: 'cancel', onPress: () => resolve(false) },
      { text: ok, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });

// Wykonanie akcji (bez 'edit' i 'reject' — te otwierają ekran / okno z polem). Zwraca nowy post
// (np. kopię po duplikacji) albo null; po usunięciu — 'deleted'.
export const runPostAction = async (action: PostAction, post: SocialPost): Promise<SocialPost | 'deleted' | null> => {
  try {
    if (action === 'approve') {
      const p = await socialApi.approve(post.id);
      toast.success(`Zatwierdzono — publikacja ${fmtWhen(p.scheduled_at)}`);
      return p;
    }
    if (action === 'publishNow') {
      if (!(await confirm('Opublikować teraz?', 'Post zostanie opublikowany od razu we wszystkich kanałach.', 'Opublikuj'))) return null;
      const p = await socialApi.publishNow(post.id);
      toast.success('Publikowanie rozpoczęte');
      return p;
    }
    if (action === 'unschedule') {
      const p = await socialApi.unschedule(post.id);
      toast.success('Post przeniesiony do szkiców');
      return p;
    }
    if (action === 'retry') {
      const p = await socialApi.retry(post.id);
      toast.success('Ponawiamy publikację');
      return p;
    }
    if (action === 'duplicate') {
      const p = await socialApi.duplicate(post.id);
      toast.success('Utworzono kopię posta');
      return p;
    }
    if (action === 'delete') {
      const published = post.status === 'published' || post.status === 'partial';
      const ok = await confirm('Usunąć post?', published
        ? 'Post zniknie z Avenit, ale zostanie na Facebooku i Instagramie — tam usuń go ręcznie, jeśli trzeba.'
        : 'Tej operacji nie można cofnąć.', 'Usuń', true);
      if (!ok) return null;
      await socialApi.remove(post.id);
      toast.success('Post usunięty');
      return 'deleted';
    }
  } catch (e) {
    showError('Nie udało się', e);
  }
  return null;
};
