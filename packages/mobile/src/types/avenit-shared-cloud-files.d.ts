// Typy wspólnej logiki plików z chmury — Dysk Google / OneDrive / SharePoint (@avenit/shared to czyste JS).
declare module '@avenit/shared/src/lib/cloudFiles.js' {
  export type CloudProvider = 'google_drive' | 'onedrive' | 'sharepoint';
  export interface CloudAttachment {
    kind: 'cloud';
    provider: CloudProvider;
    file_id: string;
    drive_id: string | null;
    name: string;
    mime_type: string | null;
    size: number | null;
    web_url: string;
    icon_url?: string | null;
    picked_by: string | null;
    picked_at: string | null;
  }
  export const CLOUD_PROVIDERS: CloudProvider[];
  export const CLOUD_LINK_TYPE: string;
  export const CLOUD_PROVIDER_LABEL: Record<CloudProvider, string>;
  export const CLOUD_OPEN_LABEL: Record<CloudProvider, string>;
  export function isCloudProvider(p: unknown): p is CloudProvider;
  export function isCloudAttachment(a: unknown): boolean;
  export function safeCloudUrl(url: unknown, provider?: CloudProvider | null): string | null;
  export function isAllowedCloudUrl(url: unknown, provider?: CloudProvider | null): boolean;
  export function cloudOpenUrl(att: unknown): string | null;
  export function cloudFromMaterialRow(row: unknown): CloudAttachment | null;
  export function cloudProviderLabel(p: string | null | undefined): string;
  export function cloudOpenLabel(p: string | null | undefined): string;
}
