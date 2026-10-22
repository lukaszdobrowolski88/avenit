import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { providerChoices, accessNotice, shareHint, filesCallbackMessage, cloudItemOf, connectLabel, fmtCloudSize } from './cloudFilesLogic';
import CloudFileLink from './CloudFileLink';
import { CloudAttachPanel } from './CloudAttachDialog';
import { msPickerUrl, pickFromMicrosoft, relayCloudConnectResult } from '../../lib/cloudFiles';
import { cloudMessageAttachment, normalizeCloudAttachment } from '@avenit/shared/src/lib/cloudFiles.js';

afterEach(cleanup);

const gAtt = normalizeCloudAttachment({ provider: 'google_drive', file_id: 'G1', name: 'Plan.pdf', size: 2048, web_url: 'https://drive.google.com/file/d/G1/view' }).value;
const spAtt = normalizeCloudAttachment({ provider: 'sharepoint', file_id: 'I1', drive_id: 'D1', name: 'Grafik.xlsx', web_url: 'https://contoso.sharepoint.com/sites/z/Grafik.xlsx' }).value;

describe('pliki z chmury — logika', () => {
  it('przyciski wyboru: wyłączone ukryte, stany połączenia', () => {
    const st = {
      google: { enabled: true, available: true, connected: true, status: 'active', account_email: 'jan@kosciol.pl', can_share_domain: true, domain: 'kosciol.pl' },
      microsoft: { enabled: true, available: true, connected: false },
    };
    expect(providerChoices(st).map((c) => [c.provider, c.state])).toEqual([['google', 'ready'], ['microsoft', 'connect']]);
    expect(providerChoices({ ...st, google: { ...st.google, enabled: false } }).map((c) => c.provider)).toEqual(['microsoft']);
    expect(providerChoices({ google: { enabled: true, available: false, connected: false } })[0].state).toBe('unavailable');
    expect(providerChoices({ google: { enabled: true, available: true, connected: true, status: 'revoked' } })[0].state).toBe('reconnect');
    expect(connectLabel('microsoft')).toBe('Połącz z OneDrive');
  });

  it('komunikat o dostępie i podpowiedzi udostępniania', () => {
    expect(accessNotice('google')).toBe('Odbiorcy muszą mieć dostęp do pliku w Dysku Google.');
    expect(accessNotice('microsoft')).toBe('Odbiorcy muszą mieć dostęp do pliku w OneDrive / SharePoint.');
    expect(shareHint('google', { canShareDomain: true })).toBeNull();
    expect(shareHint('google', { canShareDomain: false })).toMatch(/nie należy do organizacji/);
    expect(shareHint('microsoft')).toMatch(/OneDrive \/ SharePoint/);
    expect(filesCallbackMessage('google', 'connected').ok).toBe(true);
    expect(filesCallbackMessage('microsoft', 'error', 'scopes').text).toMatch(/OneDrive \/ SharePoint.*dostępu do plików/);
    expect(fmtCloudSize(2048)).toBe('2 KB');
  });

  it('odnośnik z wiersza Plików i z załącznika; zły adres → brak linku', () => {
    expect(cloudItemOf(cloudMessageAttachment(gAtt)).web_url).toBe(gAtt.web_url);
    const row = { name: 'x', external_provider: 'onedrive', external_id: 'a', external_url: 'https://contoso-my.sharepoint.com/x' };
    expect(cloudItemOf(row).provider).toBe('onedrive');
    expect(cloudItemOf({ ...row, external_url: 'javascript:alert(1)' }).web_url).toBeNull();
    expect(cloudItemOf({ url: '/storage/x', name: 'a' })).toBeNull();
  });
});

describe('pliki z chmury — wyświetlanie', () => {
  it('link „Otwórz w Dysku Google” w nowej karcie, bez pośrednictwa Avenit', () => {
    render(<CloudFileLink item={cloudMessageAttachment(gAtt)} />);
    const a = screen.getByTestId('cloud-link');
    expect(a.tagName).toBe('A');
    expect(a.getAttribute('href')).toBe('https://drive.google.com/file/d/G1/view');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toMatch(/noopener/);
    expect(a.getAttribute('aria-label')).toBe('Plan.pdf — Otwórz w Dysku Google');
    expect(screen.getByText('Dysk Google · 2 KB')).toBeTruthy();
  });

  it('podrobiony adres nie staje się linkiem', () => {
    render(<CloudFileLink item={{ ...cloudMessageAttachment(gAtt), web_url: 'javascript:alert(1)', url: 'javascript:alert(1)' }} />);
    expect(screen.getByTestId('cloud-link').tagName).toBe('DIV');
    expect(screen.getByText('Nieprawidłowy adres')).toBeTruthy();
  });

  it('podsumowanie wyboru: informacja o dostępie; udostępnienie organizacji tylko Google Workspace i domyślnie wyłączone', () => {
    const setShare = vi.fn();
    const { rerender } = render(<CloudAttachPanel phase="review" picked={{ provider: 'google', attachments: [gAtt], canShareDomain: true, domain: 'kosciol.pl' }} share={false} setShare={setShare} />);
    expect(screen.getByRole('note').textContent).toMatch(/Odbiorcy muszą mieć dostęp do pliku w Dysku Google/);
    const box = screen.getByRole('checkbox');
    expect(box.checked).toBe(false);
    expect(screen.getByText(/Udostępnij plik osobom z linkiem w mojej organizacji/)).toBeTruthy();
    expect(screen.getByText(/kosciol\.pl/)).toBeTruthy();
    rerender(<CloudAttachPanel phase="review" picked={{ provider: 'microsoft', attachments: [spAtt], canShareDomain: false }} share={false} setShare={setShare} />);
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByRole('note').textContent).toMatch(/OneDrive \/ SharePoint/);
  });

  it('wybór usługi: brak włączonych dostawców → komunikat', () => {
    render(<CloudAttachPanel phase="choose" status={{ google: { enabled: false }, microsoft: { enabled: false } }} />);
    expect(screen.getByText(/wyłączone w tym kościele/)).toBeTruthy();
  });
});

describe('okno wyboru OneDrive / SharePoint (File Picker v8)', () => {
  it('adres Pickera: SDK 8.0, kanał, tylko pliki', () => {
    const u = new URL(msPickerUrl('https://contoso-my.sharepoint.com/', 'ch1', 'pl-pl'));
    expect(u.origin + u.pathname).toBe('https://contoso-my.sharepoint.com/_layouts/15/FilePicker.aspx');
    const opts = JSON.parse(u.searchParams.get('filePicker'));
    expect(opts.sdk).toBe('8.0');
    expect(opts.messaging.channelId).toBe('ch1');
    expect(opts.typesAndSources.mode).toBe('files');
  });

  it('protokół: initialize → activate, authenticate przez serwer, pick → identyfikatory plików; obce źródło ignorowane', async () => {
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {});
    const doc = document.implementation.createHTMLDocument('picker');
    const win = { document: doc, closed: false, close() { this.closed = true; } };
    const getToken = vi.fn(async (resource) => ({ access_token: `T:${resource}` }));
    const p = pickFromMicrosoft({ base_url: 'https://contoso-my.sharepoint.com', access_token: 'SP' }, win, { getToken });
    const form = doc.querySelector('form');
    expect(form.getAttribute('method')).toBe('POST');
    expect(doc.querySelector('input[name="access_token"]').value).toBe('SP');
    const channelId = JSON.parse(new URL(form.getAttribute('action')).searchParams.get('filePicker')).messaging.channelId;
    const ch = new MessageChannel();
    const fromPicker = [];
    ch.port2.onmessage = (e) => fromPicker.push(e.data);
    // Wiadomość z obcej strony — ignorowana.
    const evil = new MessageEvent('message', { data: { type: 'initialize', channelId }, origin: 'https://evil.com' });
    Object.defineProperty(evil, 'source', { value: win });
    window.dispatchEvent(evil);
    const ev = new MessageEvent('message', { data: { type: 'initialize', channelId }, origin: 'https://contoso-my.sharepoint.com', ports: [ch.port1] });
    Object.defineProperty(ev, 'source', { value: win });
    window.dispatchEvent(ev);
    await new Promise((r) => setTimeout(r, 20));
    expect(fromPicker[0]).toEqual({ type: 'activate' });
    ch.port2.postMessage({ type: 'command', id: 'a1', data: { command: 'authenticate', resource: 'https://contoso.sharepoint.com', type: 'SharePoint' } });
    await new Promise((r) => setTimeout(r, 20));
    expect(getToken).toHaveBeenCalledWith('https://contoso.sharepoint.com');
    expect(fromPicker).toContainEqual({ type: 'result', id: 'a1', data: { result: 'token', token: 'T:https://contoso.sharepoint.com' } });
    ch.port2.postMessage({ type: 'command', id: 'p1', data: { command: 'pick', items: [{ id: 'I1', parentReference: { driveId: 'D1' } }, { id: 'X' }] } });
    const items = await p;
    expect(items).toEqual([{ file_id: 'I1', drive_id: 'D1' }]);
    expect(win.closed).toBe(true);
    submit.mockRestore();
  });

  it('strona powrotu z łączenia przekazuje wynik', () => {
    expect(relayCloudConnectResult({ search: '?files=google&files_result=connected', origin: 'https://k.avenit.pl' })).toBe(true);
    expect(relayCloudConnectResult({ search: '?tab=x', origin: 'https://k.avenit.pl' })).toBe(false);
  });
});
