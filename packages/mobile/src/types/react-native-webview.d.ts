// Ambient shim dla react-native-webview — zależność natywna (package.json), typy nie są
// zainstalowane w tym środowisku. Luźna deklaracja (any), żeby tsc przechodziło; build
// EAS dostarcza prawdziwe typy/implementację.
declare module 'react-native-webview' {
  import type { ComponentType } from 'react';
  export const WebView: ComponentType<any>;
  const _default: ComponentType<any>;
  export default _default;
}
