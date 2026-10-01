// Ambient shim dla react-native-maps — moduł jest zależnością natywną (package.json),
// ale typy nie są zainstalowane w tym środowisku. Deklarujemy luźno (any), żeby tsc
// przechodziło; w buildzie EAS pakiet dostarcza prawdziwe typy/implementację.
declare module 'react-native-maps' {
  import type { ComponentType } from 'react';
  export const PROVIDER_GOOGLE: string;
  export const PROVIDER_DEFAULT: string;
  export const Marker: ComponentType<any>;
  export const Callout: ComponentType<any>;
  const MapView: ComponentType<any>;
  export default MapView;
}
