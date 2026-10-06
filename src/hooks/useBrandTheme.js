import { useEffect, useState } from 'react';

// Czy aktywny jest motyw marki „Avenit” (paleta 'avenit' → atrybut data-color-preset na <html>,
// ustawiany przez colorPresets.js). Reaguje na przełączenie motywu w Ustawieniach.
const read = () => typeof document !== 'undefined' && document.documentElement.dataset.colorPreset === 'avenit';

export function useBrandTheme() {
  const [brand, setBrand] = useState(read);
  useEffect(() => {
    const el = document.documentElement;
    const mo = new MutationObserver(() => setBrand(read()));
    mo.observe(el, { attributes: true, attributeFilter: ['data-color-preset'] });
    return () => mo.disconnect();
  }, []);
  return brand;
}
