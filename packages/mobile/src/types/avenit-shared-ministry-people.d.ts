// Typy wspólnej logiki „Dodaj członka z listy osób” (@avenit/shared to czyste JS).
declare module '@avenit/shared/src/lib/ministryPeople.js' {
  export interface MinistryPerson {
    key: string;
    source: 'account' | 'member';
    user_id: string | null;
    member_id: string | null;
    name: string;
    email: string | null;
    phone: string | null;
    avatar_url: string | null;
    has_access: boolean;
    in_team: boolean;
  }
  export interface MinistryPeopleMeta {
    people: MinistryPerson[];
    link_user: boolean;
    grants_access: boolean;
    can_grant_access: boolean;
    phones_visible: boolean;
    members_included: boolean;
  }
  export const PEOPLE_FN: string;
  export const ROSTER_TABLES: Record<string, string[]>;
  export const DEFAULT_ROSTER_ROLE: Record<string, string>;
  export const ACCESS_NOTE: string;
  export const ACCESS_GRANTED: string;
  export function rosterTablesFor(key: string): string[];
  export function accessTableFor(key: string): string | null;
  export function grantsAccess(key: string, table: string): boolean;
  export function fold(s: unknown): string;
  export function filterPeople(people: MinistryPerson[], query: string, opts?: { limit?: number }): MinistryPerson[];
  export function prefillFromPerson(
    person: MinistryPerson | null,
    current?: Record<string, unknown>,
  ): { full_name: string; email: string; phone: string; user_id: string | null; [k: string]: unknown };
  export function shouldGrantAccess(person: MinistryPerson | null | undefined, opts: { ministryKey: string; table: string }): boolean;
  export function grantOutcome(error: unknown): 'granted' | 'already' | 'denied';
}
