// Typy dla wspólnego resolvera uprawnień (@avenit/shared to czyste JS bez deklaracji).
declare module '@avenit/shared/src/permissions/resolve.js' {
  export interface Grant {
    role: string | null;
    user_id: string | null;
    capability: string;
    allowed: boolean;
  }
  export interface Subject {
    role: string | null;
    userId: string | null;
    isAdmin?: boolean;
  }
  export interface Resolver {
    can(capability: string): boolean;
    fieldReadable(resource: string, column: string): boolean;
    fieldWritable(resource: string, column: string): boolean;
  }
  export function can(grants: Grant[], subject: Subject, capability: string): boolean;
  export function makeResolver(grants: Grant[], subject: Subject): Resolver;
}
