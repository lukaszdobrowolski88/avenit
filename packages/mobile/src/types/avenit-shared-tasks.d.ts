// Typy dla wspólnych modułów zadań i uprawnień „w zakresie służby” (@avenit/shared to czyste JS).
// Tylko funkcje (deklaracje funkcji w kilku plikach .d.ts łączą się bez konfliktu).

declare module '@avenit/shared/src/permissions/moduleScope.js' {
  type CanFn = (capability: string) => boolean;
  export function canModuleScoped(can: CanFn, moduleKey: string | null, table: string, op: string): boolean;
  export function allowedModules(can: CanFn, table: string, op: string, customKeys?: string[]): string[];
  export function moduleForTasksSource(sourceKind: string | null | undefined): string | null;
  export function boardModuleKey(board: { module_key?: string | null; source_kind?: string | null } | null | undefined): string | null;
  export function sliceResource(moduleKey: string | null | undefined, kind: 'events' | 'tasks' | 'task_comments'): string | null;
  export function isCustomModuleKey(key: unknown): boolean;
}

declare module '@avenit/shared/src/lib/taskLinks.js' {
  export interface ParsedTaskLink {
    kind: 'board' | 'module';
    moduleKey?: string;
    boardId?: string | null;
    itemId: string;
  }
  export function parseTaskLink(link: string | null | undefined, paths?: Record<string, string>): ParsedTaskLink | null;
  export function taskItemLink(
    board: { id?: string | number | null; module_key?: string | null; source_kind?: string | null } | null | undefined,
    itemId: string | number,
    paths?: Record<string, string>,
  ): string;
  export function taskBoardModuleKey(board: { module_key?: string | null; source_kind?: string | null } | null | undefined): string | null;
  export function modulePathFor(key: string, paths?: Record<string, string>): string;
}

declare module '@avenit/shared/src/lib/boardStatus.js' {
  export function isDoneLabel(label: { title?: string | null; done?: boolean | null } | null | undefined): boolean;
  export function doneLabelOf<T extends { title?: string | null; done?: boolean | null }>(
    column: { settings?: { labels?: T[] } | null } | null | undefined,
  ): T | null;
}
