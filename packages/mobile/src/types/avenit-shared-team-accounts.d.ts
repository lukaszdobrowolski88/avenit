// Typy wspólnej reguły kont osób ze składu Tłumaczeń (@avenit/shared to czyste JS).
declare module '@avenit/shared/src/lib/teamAccounts.js' {
  export type TeamAccount = 'active' | 'inactive' | 'none';
  export interface AccountBadge { kind: 'none' | 'inactive'; label: string; hint: string }
  export const ACCOUNTS_FN: string;
  export const ACCOUNTS_TEAM: string;
  export const ACCOUNT_BADGES: Record<'none' | 'inactive', { label: string; hint: string }>;
  export function accountsById(resp: unknown): Map<string, TeamAccount>;
  export function accountBadge(account: string | null | undefined, opts?: { active?: boolean }): AccountBadge | null;
  export function canInvite(badge: AccountBadge | null | undefined, email: string | null | undefined, allowed: boolean): boolean;
}
