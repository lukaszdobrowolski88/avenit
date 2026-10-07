import { Alert } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { respondMessage, respondToAssignment, type AssignmentAnswer } from '../../lib/assignments';
import { showError } from '../../lib/errors';
import { toast } from '../../lib/toast';

// Odpowiedź na zaproszenie do służby z pulpitu — przez serwer (/api/assignment/:id/respond),
// z tymi samymi komunikatami i potwierdzeniem odmowy co widżet „Moja służba” na webie.
export const useRespondToAssignment = () => {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ id, answer }: { id: string; answer: AssignmentAnswer }) => respondToAssignment(id, answer),
    onSuccess: (r, v) => {
      const msg = respondMessage(v.answer, r);
      if (r.already) toast.info(msg);
      else toast.success(msg);
    },
    onError: (e) => showError('Nie udało się zapisać odpowiedzi', e, 'Nie udało się zapisać odpowiedzi. Spróbuj ponownie.'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['assignments'] });
      qc.invalidateQueries({ queryKey: ['event-detail'] });
      qc.invalidateQueries({ queryKey: ['programs', 'team'] });
    },
  });

  const accept = (id: string) => mutation.mutateAsync({ id, answer: 'accepted' }).catch(() => undefined);

  // Odmowa zawsze z potwierdzeniem i skutkiem (jak web).
  const reject = (id: string, what?: string | null) =>
    new Promise<void>((resolve) => {
      Alert.alert(
        'Odrzucić przydział?',
        `${what ? `„${what}”. ` : ''}Twoje imię zniknie z grafiku na ten dzień, a lider zobaczy odmowę.`,
        [
          { text: 'Anuluj', style: 'cancel', onPress: () => resolve() },
          {
            text: 'Odrzuć',
            style: 'destructive',
            onPress: () => {
              mutation
                .mutateAsync({ id, answer: 'rejected' })
                .catch(() => undefined)
                .finally(() => resolve());
            },
          },
        ],
        { cancelable: true, onDismiss: () => resolve() },
      );
    });

  return { accept, reject, pendingId: mutation.isPending ? mutation.variables?.id ?? null : null };
};
