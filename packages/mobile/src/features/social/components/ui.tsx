import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Film, MoreHorizontal } from 'lucide-react-native';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { B } from '../../../components/ui/brand';
import { FONT as F } from '../../../lib/fonts';
import { POST_STATUS_LABELS, TARGET_STATUS_LABELS } from '@avenit/shared/src/lib/social.js';
import { mediaUri, type PostStatus, type Provider, type SocialAccount, type SocialPost, type TargetStatus } from '../api';

// Znaki sieci rysowane lokalnie (lucide-react-native nie ma już logotypów marek) — monochromatyczne,
// w kolorze słodu, jak reszta ikon apki.
export const ProviderGlyph = ({ provider, size = 12, color = B.ink }: { provider: Provider; size?: number; color?: string }) =>
  provider === 'instagram' ? (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={3} width={18} height={18} rx={5} stroke={color} strokeWidth={2} />
      <Circle cx={12} cy={12} r={4} stroke={color} strokeWidth={2} />
      <Circle cx={17.3} cy={6.7} r={1.2} fill={color} />
    </Svg>
  ) : (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M14 8h3V4h-3c-2.8 0-4.5 1.8-4.5 4.6V11H7v4h2.5v6h4v-6h3l.5-4h-3.5V9c0-.6.4-1 1-1Z" fill={color} />
    </Svg>
  );

export const providerLabel = (p: Provider) => (p === 'instagram' ? 'Instagram' : 'Facebook');
export const channelName = (a?: Pick<SocialAccount, 'provider' | 'name' | 'username'> | null) =>
  a ? (a.provider === 'instagram' && a.username ? `@${a.username}` : a.name) : '';

const initials = (name: string) =>
  name.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

// Awatar kanału z plakietką sieci; kropka statusu publikacji (opcjonalnie).
export const ChannelAvatar = ({
  account, provider, name, size = 36, dim, selected, status,
}: {
  account?: SocialAccount | null; provider?: Provider; name?: string | null; size?: number; dim?: boolean; selected?: boolean; status?: TargetStatus | null;
}) => {
  const prov = (provider || account?.provider || 'facebook') as Provider;
  const label = name || account?.name || '';
  const badge = Math.max(15, Math.round(size * 0.44));
  return (
    <View style={{ width: size, height: size, opacity: dim ? 0.4 : 1 }}>
      <View
        style={{
          width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: B.paper2,
          alignItems: 'center', justifyContent: 'center', borderWidth: selected ? 2.5 : 0, borderColor: B.kurkuma,
        }}
      >
        {account?.avatar_url ? (
          <Image source={{ uri: account.avatar_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        ) : (
          <Text style={{ fontSize: Math.round(size * 0.36), color: B.ink2, fontFamily: F.bold }}>{initials(label)}</Text>
        )}
      </View>
      <View style={{ position: 'absolute', right: -3, bottom: -3, width: badge, height: badge, borderRadius: badge / 2, backgroundColor: B.card, alignItems: 'center', justifyContent: 'center' }}>
        <ProviderGlyph provider={prov} size={Math.round(badge * 0.62)} />
      </View>
      {status ? (
        <View style={{ position: 'absolute', left: -1, top: -1, width: 11, height: 11, borderRadius: 6, borderWidth: 2, borderColor: B.card, backgroundColor: TARGET_DOT[status] }} />
      ) : null}
    </View>
  );
};

// Kolory statusów jak na webie — bez „tęczy”: szarość, musztarda, zieleń/czerwień tylko jako wynik.
export const STATUS_META: Record<PostStatus, { fg: string; bg: string }> = {
  draft: { fg: '#4A463E', bg: '#ECE8DE' },
  pending_approval: { fg: '#6B4F05', bg: '#FFF1C2' },
  scheduled: { fg: '#2A2312', bg: '#ECE8DE' },
  publishing: { fg: '#6B4F05', bg: '#FFF1C2' },
  published: { fg: '#1E6B34', bg: '#E7F3EA' },
  partial: { fg: '#6B4F05', bg: '#FFF1C2' },
  failed: { fg: '#B42318', bg: '#FDE7E4' },
};
export const TARGET_DOT: Record<TargetStatus, string> = {
  pending: '#B5AD99', publishing: '#D99A06', processing: '#D99A06', published: '#1E6B34', failed: '#B42318',
};

export const StatusPill = ({ status }: { status: PostStatus }) => {
  const m = STATUS_META[status] ?? STATUS_META.draft;
  return (
    <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: m.bg }}>
      <Text numberOfLines={1} style={{ fontSize: 11, color: m.fg, fontFamily: F.bold }}>{(POST_STATUS_LABELS as Record<string, string>)[status] || status}</Text>
    </View>
  );
};

export const targetLabel = (s: TargetStatus) => (TARGET_STATUS_LABELS as Record<string, string>)[s] || s;

export const fmtWhen = (iso?: string | null) => (iso ? format(new Date(iso), 'EEE d MMM, HH:mm', { locale: pl }) : '');
export const fmtTime = (iso?: string | null) => (iso ? format(new Date(iso), 'HH:mm') : '');
export const fmtDayHeading = (iso: string) => {
  const d = new Date(iso);
  const key = format(d, 'yyyy-MM-dd');
  const today = format(new Date(), 'yyyy-MM-dd');
  const tomorrow = format(new Date(Date.now() + 86400_000), 'yyyy-MM-dd');
  const yesterday = format(new Date(Date.now() - 86400_000), 'yyyy-MM-dd');
  const long = format(d, 'EEEE, d MMMM', { locale: pl });
  if (key === today) return `Dziś · ${long}`;
  if (key === tomorrow) return `Jutro · ${long}`;
  if (key === yesterday) return `Wczoraj · ${long}`;
  return long.charAt(0).toUpperCase() + long.slice(1);
};

const snippet = (t: string, max = 160) => {
  const s = String(t || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

// Karta posta w listach — miękka biała pigułka (bez pasków-akcentów), godzina z lewej.
export const PostCard = ({
  post, accounts, showTime, onPress, onMenu,
}: {
  post: SocialPost; accounts: Map<string, SocialAccount>; showTime?: boolean; onPress: () => void; onMenu: () => void;
}) => {
  const first = post.media?.[0];
  const when = post.published_at || post.scheduled_at;
  const showTargetStatus = !['draft', 'pending_approval', 'scheduled'].includes(post.status);
  const failed = post.targets.filter((t) => t.status === 'failed' && t.error);
  return (
    <Pressable onPress={onPress} onLongPress={onMenu} accessibilityRole="button" className="active:opacity-80"
      style={{ borderRadius: 22, backgroundColor: B.card, padding: 14, marginBottom: 10, flexDirection: 'row', gap: 12 }}>
      {showTime ? (
        <Text style={{ width: 44, paddingTop: 1, fontSize: 14, color: B.ink, fontFamily: F.bold, fontVariant: ['tabular-nums'] }}>{when ? fmtTime(when) : ''}</Text>
      ) : null}
      {first ? (
        <View style={{ width: 58, height: 58, borderRadius: 14, overflow: 'hidden', backgroundColor: B.paper2, alignItems: 'center', justifyContent: 'center' }}>
          {first.kind === 'video' ? <Film size={20} color={B.ink3} /> : <Image source={{ uri: mediaUri(first, 128) }} style={{ width: '100%', height: '100%' }} contentFit="cover" />}
          {post.media.length > 1 ? (
            <View style={{ position: 'absolute', right: 3, bottom: 3, paddingHorizontal: 5, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.6)' }}>
              <Text style={{ fontSize: 10, color: '#fff', fontFamily: F.bold }}>{`+${post.media.length - 1}`}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={3} style={{ fontSize: 14, lineHeight: 19, color: post.content ? B.ink : B.ink4, fontFamily: F.medium }}>
          {snippet(post.content) || 'Post bez tekstu'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {post.targets.map((t) => (
              <ChannelAvatar key={t.id} account={t.account_id ? accounts.get(t.account_id) : null} provider={t.provider} name={t.account_name} size={22}
                status={showTargetStatus ? t.status : null} />
            ))}
          </View>
          <StatusPill status={post.status} />
        </View>
        {failed.slice(0, 2).map((t) => (
          <Text key={t.id} numberOfLines={2} style={{ marginTop: 6, fontSize: 12, color: B.danger, fontFamily: F.medium }}>{`${t.account_name}: ${t.error}`}</Text>
        ))}
      </View>
      <Pressable onPress={onMenu} hitSlop={10} accessibilityRole="button" accessibilityLabel="Więcej" className="active:opacity-60"
        style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: B.paper, alignItems: 'center', justifyContent: 'center' }}>
        <MoreHorizontal size={17} color={B.ink2} />
      </Pressable>
    </Pressable>
  );
};
