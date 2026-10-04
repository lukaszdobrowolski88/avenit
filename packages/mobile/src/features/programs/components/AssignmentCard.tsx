import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { Check, X } from 'lucide-react-native';
import { useUpdateAssignmentStatus, type MyAssignmentRow } from '../api';

interface Props {
  assignment: MyAssignmentRow;
}

const formatRole = (a: MyAssignmentRow): string => {
  const parts = [a.team_type, a.role_key].filter(Boolean) as string[];
  return parts.join(' · ') || 'Służba';
};

const STATUS_META = {
  accepted: { color: '#047857', label: 'Potwierdzone' },
  rejected: { color: '#be123c', label: 'Odrzucone' },
  pending: { color: '#8A6606', label: 'Oczekuje na potwierdzenie' },
} as const;

export const AssignmentCard = ({ assignment }: Props) => {
  const update = useUpdateAssignmentStatus();
  const isPending = assignment.status === 'pending';
  const meta = STATUS_META[assignment.status];

  return (
    <View
      style={{
        backgroundColor: '#F6F4EE',
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#E6E1D5',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 14,
              color: '#2A2312',
              letterSpacing: -0.2,
              fontFamily: 'Manrope_600SemiBold',
            }}
          >
            {formatRole(assignment)}
          </Text>
          <Text
            style={{
              fontSize: 12,
              marginTop: 4,
              color: meta.color,
              fontFamily: 'Manrope_500Medium',
            }}
          >
            {meta.label}
          </Text>
        </View>

        {isPending && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {update.isPending ? (
              <ActivityIndicator color="#2A2312" />
            ) : (
              <>
                <Pressable
                  onPress={() =>
                    update.mutate(
                      { id: assignment.id, status: 'accepted' },
                      {
                        onError: (err: any) =>
                          Alert.alert('Błąd', err?.message ?? 'Nie udało się zapisać odpowiedzi.'),
                      },
                    )
                  }
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: '#FFBE0B',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Check color="#2A2312" size={18} strokeWidth={2.6} />
                </Pressable>
                <Pressable
                  onPress={() =>
                    update.mutate(
                      { id: assignment.id, status: 'rejected' },
                      {
                        onError: (err: any) =>
                          Alert.alert('Błąd', err?.message ?? 'Nie udało się zapisać odpowiedzi.'),
                      },
                    )
                  }
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: '#ECE8DE',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <X color="#B42318" size={18} strokeWidth={2.4} />
                </Pressable>
              </>
            )}
          </View>
        )}
      </View>
    </View>
  );
};
