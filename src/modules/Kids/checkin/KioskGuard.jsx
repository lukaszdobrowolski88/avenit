import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isKioskActive } from './utils/kiosk';

// Strażnik trybu kiosku dla całej aplikacji: gdy na tym urządzeniu włączono kiosk meldowania
// dzieci, każda inna trasa (wpisany adres, link, „wstecz”) wraca do /kids, gdzie nakładka
// kiosku czeka na PIN. Montować raz wewnątrz <BrowserRouter> w części dla zalogowanych:
//   <KioskGuard />
export default function KioskGuard() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isKioskActive()) return;
    if (!location.pathname.startsWith('/kids')) {
      navigate('/kids', { replace: true });
    }
  }, [location.pathname, navigate]);

  return null;
}
