// Widoczność widżetów Pulpitu wg uprawnień (capability), a nie starej listy ról
// (utils/tabPermissions.js). Widżety z danymi modułu wymagają dostępu do tego modułu —
// ten sam warunek, który sprawdza serwer przy odczycie danych.
const WIDGET_CAPABILITY = {
  givingMonth: 'module:giving',
  attendance: 'module:attendance',
};

export const widgetAllowed = (widgetId, can) => {
  const cap = WIDGET_CAPABILITY[widgetId];
  return !cap || can(cap);
};
