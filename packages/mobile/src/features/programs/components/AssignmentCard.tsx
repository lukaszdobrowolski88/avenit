import { ActivityIndicator, Pressable, Text, View } from 'react-native';
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
  pending: { color: '#b45309', label: 'Oczekuje na potwierdzenie' },
} as const;

export const AssignmentCard = ({ assignment }: Props) => {
  const update = useUpdateAssignmentStatus();
  const isPending = assignment.status === 'pending';
  const meta = STATUS_META[assignment.status];

  return (
    <View
      style={{
        backgroundColor: '#ffffff',
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#eef0f3',
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
              color: '#0c0a09',
              letterSpacing: -0.2,
              fontFamily: 'Inter_600SemiBold',
            }}
          >
            {formatRole(assignment)}
          </Text>
          <Text
            style={{
              fontSize: 12,
              marginTop: 4,
              color: meta.color,
              fontFamily: 'Inter_500Medium',
            }}
          >
            {meta.label}
          </Text>
        </View>

        {isPending && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {update.isPending ? (
              <ActivityIndicator color="#ec4899" />
            ) : (
              <>
                <Pressable
                  onPress={() => update.mutate({ id: assignment.id, status: 'accepted' })}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: '#10b981',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Check color="white" size={18} />
                </Pressable>
                <Pressable
                  onPress={() => update.mutate({ id: assignment.id, status: 'rejected' })}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: '#f43f5e',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <X color="white" size={18} />
                </Pressable>
              </>
            )}
          </View>
        )}
      </View>
    </View>
  );
};
