// @avenit/shared - Shared logic for web and mobile

// Color presets & theming
export {
  COLOR_PRESETS,
  generateShades,
  hexToRgb,
  mixColor,
  rgbTripletToColor,
  getPresetColors,
} from './lib/colorPresets.js';

// Tab permissions
export { TAB_PERMISSIONS, hasTabAccess } from './utils/tabPermissions.js';

// Fabryka klienta danych (Avenit API, interfejs zgodny z supabase-js)
export { createSupabaseClient, createCachedUserHelper, createApiClient, CACHE_DURATION } from './lib/supabase.js';

// Tenant context
export {
  createTenantContext,
} from './lib/tenantContext.js';

// Constants
export { SYSTEM_MODULE_KEYS, ROLES } from './lib/constants.js';
