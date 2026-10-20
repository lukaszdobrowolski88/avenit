// Typy wspólnej reguły przestrzeni wrażliwych Plików (@avenit/shared to czyste JS).
declare module '@avenit/shared/src/lib/materialsAccess.js' {
  export const SENSITIVE_MATERIAL_TEAMS: string[];
  export function isSensitiveMaterialTeam(team: string | null | undefined): boolean;
  export function materialsPathTeam(storagePath: string | null | undefined): string | null;
  export function isSignedMaterialsPath(storagePath: string | null | undefined): boolean;
}
