// Deklaracje typów dla @avenit/shared.
// Pakiet jest w czystym JS; ten plik daje mobile'owi (strict TS) poprawne typy
// klienta zgodnego interfejsem z supabase-js. Zero wpływu na runtime.

// =============================================================================
// Data client (Avenit API, interfejs zgodny z supabase-js)
// =============================================================================

export interface PostgrestError {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
  status?: number;
}

export interface PostgrestResponse<T = any> {
  data: T;
  error: PostgrestError | null;
  count: number | null;
  status: number;
  statusText: string;
}

export interface QueryBuilder<T = any> extends PromiseLike<PostgrestResponse<T>> {
  select(columns?: string, opts?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }): QueryBuilder<T>;
  insert(values: any): QueryBuilder<T>;
  upsert(values: any, opts?: { onConflict?: string; ignoreDuplicates?: boolean }): QueryBuilder<T>;
  update(values: any): QueryBuilder<T>;
  delete(): QueryBuilder<T>;

  eq(column: string, value: any): QueryBuilder<T>;
  neq(column: string, value: any): QueryBuilder<T>;
  gt(column: string, value: any): QueryBuilder<T>;
  gte(column: string, value: any): QueryBuilder<T>;
  lt(column: string, value: any): QueryBuilder<T>;
  lte(column: string, value: any): QueryBuilder<T>;
  like(column: string, value: any): QueryBuilder<T>;
  ilike(column: string, value: any): QueryBuilder<T>;
  is(column: string, value: any): QueryBuilder<T>;
  in(column: string, values: readonly any[]): QueryBuilder<T>;
  contains(column: string, value: any): QueryBuilder<T>;
  or(expr: string): QueryBuilder<T>;
  not(column: string, operator: string, value: any): QueryBuilder<T>;
  match(obj: Record<string, any>): QueryBuilder<T>;
  filter(column: string, operator: string, value: any): QueryBuilder<T>;

  order(column: string, opts?: { ascending?: boolean; nullsFirst?: boolean }): QueryBuilder<T>;
  limit(n: number): QueryBuilder<T>;
  range(from: number, to: number): QueryBuilder<T>;
  single(): QueryBuilder<T>;
  maybeSingle(): QueryBuilder<T>;
  throwOnError(): QueryBuilder<T>;
}

export interface AuthUser {
  id: string;
  email: string;
  full_name?: string | null;
  role?: string | null;
  user_metadata?: Record<string, any> | null;
  [key: string]: any;
}

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  user: AuthUser | null;
}

export interface AuthResponse {
  data: { user: AuthUser | null; session: AuthSession | null; requires2fa?: boolean };
  error: PostgrestError | null;
}

export interface AuthSubscription {
  data: { subscription: { unsubscribe(): void } };
}

export interface AppLoginResult {
  multiple?: boolean;
  tenants?: { slug: string; name: string }[];
  requires2fa?: boolean;
  tenant?: string;
  churchName?: string;
  ticket?: string;
  redirect?: string;
}

export interface AuthClient {
  appLogin(creds: {
    email: string;
    password: string;
    totpCode?: string;
    tenant?: string;
  }): Promise<{ data: AppLoginResult | null; error: PostgrestError | null }>;
  signInWithPassword(creds: { email: string; password: string; totpCode?: string }): Promise<AuthResponse>;
  signUp(creds: { email: string; password: string }): Promise<AuthResponse>;
  signOut(): Promise<{ error: PostgrestError | null }>;
  getUser(): Promise<{ data: { user: AuthUser | null }; error: PostgrestError | null }>;
  getSession(): Promise<{ data: { session: AuthSession | null }; error: PostgrestError | null }>;
  setSession(tokens: { access_token: string; refresh_token: string }): Promise<{ data: { session: AuthSession | null }; error: PostgrestError | null }>;
  updateUser(attrs: { password?: string; [key: string]: any }): Promise<{ data: { user: AuthUser | null }; error: PostgrestError | null }>;
  resetPasswordForEmail(email: string, opts?: Record<string, any>): Promise<{ data: any; error: PostgrestError | null }>;
  loginWithTicket(ticket: string): Promise<AuthResponse>;
  onAuthStateChange(callback: (event: string, session: AuthSession | null) => void): AuthSubscription;
}

export interface RealtimePayload<T = any> {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE' | string;
  new: T | null;
  old: T | null;
  table: string;
}

export interface RealtimeChannel {
  topic?: string;
  on(type: string, filter: Record<string, any>, callback: (payload: RealtimePayload) => void): RealtimeChannel;
  on(type: string, callback: (payload: RealtimePayload) => void): RealtimeChannel;
  subscribe(statusCallback?: (status: string) => void): RealtimeChannel;
  unsubscribe(): void | Promise<any>;
  send?(...args: any[]): void;
}

export interface StorageFileApi {
  upload(path: string, file: any, opts?: { upsert?: boolean; contentType?: string }): Promise<{ data: any; error: PostgrestError | null }>;
  getPublicUrl(path: string): { data: { publicUrl: string } };
  createSignedUrl(path: string, expiresIn: number): Promise<{ data: { signedUrl: string } | null; error: PostgrestError | null }>;
  remove(paths: string[]): Promise<{ data: any; error: PostgrestError | null }>;
  list(prefix?: string, opts?: Record<string, any>): Promise<{ data: any[]; error: PostgrestError | null }>;
  download(path: string): Promise<{ data: Blob | null; error: PostgrestError | null }>;
}

export interface StorageClient {
  from(bucket: string): StorageFileApi;
}

export interface AvenitClient {
  from(table: string): QueryBuilder;
  auth: AuthClient;
  storage: StorageClient;
  functions: { invoke(name: string, opts?: { body?: any }): Promise<{ data: any; error: PostgrestError | null }> };
  rpc(name: string, args?: Record<string, any>): Promise<{ data: any; error: PostgrestError | null }>;
  channel(name: string): RealtimeChannel;
  removeChannel(chan: RealtimeChannel): void;
  getChannels(): RealtimeChannel[];
  removeAllChannels(): void;
  setTenant(slug: string | null): Promise<void>;
  getTenant(): string | null;
}

export interface StorageAdapter {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}

export function createApiClient(opts: {
  apiUrl?: string;
  tenant?: string;
  storage?: StorageAdapter;
  realtime?: boolean;
  fetch?: typeof fetch;
}): AvenitClient;

export function createSupabaseClient(
  apiUrl: string,
  options?: { tenant?: string; storage?: StorageAdapter; realtime?: boolean },
): AvenitClient;

export function createCachedUserHelper(client: AvenitClient): {
  getCachedUser(): Promise<AuthUser | null>;
  clearUserCache(): void;
};

export const CACHE_DURATION: number;

// =============================================================================
// Color presets & theming
// =============================================================================

export const COLOR_PRESETS: Record<string, any>;
export function generateShades(baseColor: string): Record<string, string>;
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null;
export function mixColor(a: string, b: string, ratio?: number): string;
export function rgbTripletToColor(triplet: string): string;
export function getPresetColors(preset: string): any;

// =============================================================================
// Permissions / constants / tenant
// =============================================================================

export const TAB_PERMISSIONS: Record<string, any>;
export function hasTabAccess(tab: string, ...args: any[]): boolean;
export function createTenantContext(...args: any[]): any;
export const SYSTEM_MODULE_KEYS: Record<string, string> | string[];
export const ROLES: Record<string, any>;
