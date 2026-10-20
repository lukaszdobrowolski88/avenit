// Typy wspólnego modułu terminów Komunikatora (@avenit/shared to czyste JS).
declare module '@avenit/shared/src/lib/chatSchedule.js' {
  type At = Date | string | number;
  export interface ChatPreset {
    key: string;
    at: Date;
  }
  export interface ChatTimeParts {
    kind: 'today' | 'tomorrow' | 'date';
    time: string;
    date: string;
    weekday: number;
  }
  export const CHAT_TZ: string;
  export const MIN_LEAD_MS: number;
  export const MAX_AHEAD_MS: number;
  export function warsawOffsetMinutes(ms: number): number;
  export function warsawParts(at: At): { year: number; month: number; day: number; hour: number; minute: number; weekday: number };
  export function warsawToDate(year: number, month: number, day: number, hour?: number, minute?: number): Date;
  export function warsawYmdHm(at: At): { ymd: string; hm: string };
  export function fromWarsawYmdHm(ymd: string, hm: string): Date | null;
  export function isValidChatTime(at: At, now?: At): boolean;
  export function schedulePresets(now?: At): ChatPreset[];
  export function reminderPresets(now?: At): ChatPreset[];
  export function nextMondayAt(now?: At, hour?: number): Date;
  export function describeChatTime(at: At, now?: At): ChatTimeParts;
  export function chatTimeLabelPl(at: At, now?: At): string;
  export const WEEKDAYS_PL: string[];
}
