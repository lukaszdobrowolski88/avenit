// Podmoduł uprawnień — jedno źródło prawdy (web + api + admin).
// Import: `@avenit/shared/src/permissions/index.js` (czyste JS, bez zależności przeglądarki/node).
export {
  CRUD_OPS, CRUD_LABELS, MODULES, RESOURCE_MODULE, SETTINGS_WRITE_CAPABILITY, FN_CAPABILITY,
  getModule, allCapabilities, capabilityGroups, crudCapability,
} from './catalog.js';
export { can, makeResolver, fieldDenied } from './resolve.js';
export { BUILTIN_ROLES, ROLE_PRESETS, presetGrantRows } from './presets.js';
