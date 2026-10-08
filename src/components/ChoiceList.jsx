import React from 'react';
import { ChevronRight } from 'lucide-react';
import './choiceList.css';

// Lista wyboru w oknie („Co chcesz dodać?”, „Wybierz kalendarz”): wiersze z ikoną w kafelku,
// tytułem i opisem. Własne klasy ch-* — warstwa marki przemalowuje bg-white+border na beżowe
// pigułki, a karty z gradientem i emoji wyglądały jak szablon. `primary` = podpowiadany wybór.
//   <ChoiceList><ChoiceRow icon={Church} title="Nabożeństwo" description="…" primary onClick={…} /></ChoiceList>
export function ChoiceList({ label, children }) {
  return (
    <div className="ch-group">
      {label && <div className="ch-label">{label}</div>}
      <div className="ch-list">{children}</div>
    </div>
  );
}

export function ChoiceRow({ icon: Icon, title, description, primary = false, onClick, ...props }) {
  return (
    <button type="button" className={`ch-row${primary ? ' ch-row--primary' : ''}`} onClick={onClick} {...props}>
      <span className="ch-tile" aria-hidden="true">{Icon && <Icon size={20} strokeWidth={1.9} />}</span>
      <span className="ch-text">
        <span className="ch-title">{title}</span>
        {description && <span className="ch-desc">{description}</span>}
      </span>
      <ChevronRight size={17} className="ch-chev" aria-hidden="true" />
    </button>
  );
}
