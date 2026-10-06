import { describe, it, expect, vi } from 'vitest';
import React, { useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import ResponsiveTabs from './ResponsiveTabs';

vi.mock('../hooks/useModuleLabel', () => ({
  useModuleTabs: () => null,
  invalidateModuleLabels: () => {},
}));
vi.mock('./Can', () => ({ useCan: () => false }));
vi.mock('../lib/supabase', () => ({ supabase: {} }));

const TABS = [
  { id: 'members', label: 'Członkowie' },
  { id: 'files', label: 'Pliki' },
  { id: 'care', label: 'Opieka' },
];
const INNER = [
  { id: 'people', label: 'Kartoteka' },
  { id: 'fields', label: 'Definicje pól' },
];

let lastLocation = null;
let nav = null;
function Spy() {
  lastLocation = useLocation();
  nav = useNavigate();
  return null;
}

function Inner() {
  const [view, setView] = useState('people');
  return (
    <div data-testid="inner">
      <ResponsiveTabs moduleKey="care" tabs={INNER} activeTab={view} onChange={setView} />
      <span data-testid="inner-active">{view}</span>
    </div>
  );
}

function Page() {
  const [tab, setTab] = useState('members');
  return (
    <div>
      <ResponsiveTabs moduleKey="members" tabs={TABS} activeTab={tab} onChange={setTab} />
      <span data-testid="active">{tab}</span>
      {tab === 'care' && <Inner />}
      <Spy />
    </div>
  );
}

const renderAt = (url) => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes><Route path="/members" element={<Page />} /></Routes>
  </MemoryRouter>
);

// Zakładki renderują się 2× (telefon + desktop) — klikamy pierwszy egzemplarz.
const clickTab = (name, scope = document) => fireEvent.click(Array.from(scope.querySelectorAll('[role="tab"]')).find((b) => b.textContent === name));

describe('ResponsiveTabs — zakładka w adresie (UXE-10)', () => {
  it('otwiera zakładkę z ?tab= (link / odświeżenie)', () => {
    renderAt('/members?tab=files');
    expect(screen.getByTestId('active').textContent).toBe('files');
  });

  it('bez ?tab= nie dopisuje parametru na wejściu', () => {
    renderAt('/members');
    expect(screen.getByTestId('active').textContent).toBe('members');
    expect(lastLocation.search).toBe('');
  });

  it('klik w zakładkę zapisuje ją w adresie, Wstecz wraca do poprzedniej', () => {
    renderAt('/members');
    clickTab('Pliki');
    expect(screen.getByTestId('active').textContent).toBe('files');
    expect(new URLSearchParams(lastLocation.search).get('tab')).toBe('files');
    act(() => nav(-1));
    expect(screen.getByTestId('active').textContent).toBe('members');
  });

  it('klik w pozycję menu tego samego modułu (navReset) wraca do zakładki domyślnej', () => {
    renderAt('/members?tab=files');
    expect(screen.getByTestId('active').textContent).toBe('files');
    act(() => nav('/members', { state: { navReset: true } }));
    expect(screen.getByTestId('active').textContent).toBe('members');
  });

  it('zmiana adresu przez moduł (bez navReset, PUSH) nie przełącza zakładki', () => {
    renderAt('/members?tab=files');
    act(() => nav('/members?edit=1'));
    expect(screen.getByTestId('active').textContent).toBe('files');
  });

  it('zagnieżdżone zakładki z moduleKey nie nadpisują ?tab= głównej instancji', () => {
    renderAt('/members?tab=care');
    expect(screen.getByTestId('active').textContent).toBe('care');
    const inner = screen.getByTestId('inner');
    clickTab('Definicje pól', inner);
    expect(screen.getByTestId('inner-active').textContent).toBe('fields');
    expect(new URLSearchParams(lastLocation.search).get('tab')).toBe('care');
  });

  it('nieznana zakładka w adresie jest ignorowana', () => {
    renderAt('/members?tab=nie-ma');
    expect(screen.getByTestId('active').textContent).toBe('members');
  });

  it('role ARIA: tablist / tab / aria-selected', () => {
    renderAt('/members?tab=files');
    const selected = Array.from(document.querySelectorAll('[role="tab"][aria-selected="true"]'));
    expect(selected.length).toBeGreaterThan(0);
    expect(selected.every((el) => el.textContent === 'Pliki')).toBe(true);
    expect(document.querySelectorAll('[role="tablist"]').length).toBeGreaterThan(0);
  });

  it('działa też poza routerem (bez synchronizacji adresu)', () => {
    function Plain() {
      const [tab, setTab] = useState('members');
      return (<><ResponsiveTabs moduleKey="members" tabs={TABS} activeTab={tab} onChange={setTab} /><span data-testid="plain">{tab}</span></>);
    }
    render(<Plain />);
    clickTab('Opieka');
    expect(screen.getByTestId('plain').textContent).toBe('care');
  });
});
