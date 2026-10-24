import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Megaphone } from 'lucide-react';
import { useCan } from '../../components/Can';
import { tr } from '../../i18n';
import { toast } from '../../lib/toast';

// „Udostępnij w social media” z innych modułów (wydarzenie, kazanie) → moduł Social Media z gotowym
// szkicem (/social?share=<rodzaj>:<id>). Widoczny dla osób, które mogą tworzyć posty.
export default function ShareToSocialButton({ kind, id, disabledReason, className = '' }) {
  const navigate = useNavigate();
  const hasModule = useCan('module:social');
  const canCreate = useCan('res:social_posts:create');
  const canPublish = useCan('action:social:publish');
  if (!hasModule || (!canCreate && !canPublish) || id == null) return null;
  const go = () => {
    if (disabledReason) { toast.error(disabledReason); return; }
    navigate(`/social?share=${kind}:${encodeURIComponent(String(id))}`);
  };
  return (
    <button type="button" onClick={go} title={tr('Udostępnij w social media')} aria-label={tr('Udostępnij w social media')}
      className={`p-2 shrink-0 rounded-lg text-gray-500 hover:text-accent-primary hover:bg-gray-100 dark:hover:bg-gray-700 ${className}`}>
      <Megaphone size={kind === 'sermon' ? 15 : 18} aria-hidden="true" />
    </button>
  );
}
