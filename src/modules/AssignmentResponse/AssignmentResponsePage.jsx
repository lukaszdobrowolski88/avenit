import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2, AlertCircle, Calendar, User, Music } from 'lucide-react';
import { tr, appLocale } from '../../i18n';

// Strona akceptacji/odrzucenia zaproszenia do służby. Zaproszony jest NIEzalogowany —
// autoryzuje sam token z linku w mailu. Dane idą przez publiczne endpointy
// /api/public/assignment/:token (odczyt) i .../respond (accept/reject), NIE przez /api/db
// (który wymaga logowania).
// Link z maila (…&action=accept|reject) NIE zapisuje odpowiedzi od razu: pokazujemy ekran
// potwierdzenia z wyróżnioną akcją. Inaczej skaner linków w skrzynce (albo przypadkowe
// kliknięcie) mógł odrzucić służbę i zdjąć osobę z grafiku bez jej wiedzy.
export default function AssignmentResponsePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const urlAction = searchParams.get('action');
  const intent = urlAction === 'accept' || urlAction === 'reject' ? urlAction : null;

  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState([]); // wspólny token = wiele służb
  const [program, setProgram] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [alreadyResponded, setAlreadyResponded] = useState(false);
  const [submitting, setSubmitting] = useState(null); // 'accept' | 'reject' w trakcie zapisu

  const assignedByName = assignments[0]?.assigned_by_name;

  const roleNames = {
    lider: tr('Lider Uwielbienia'),
    piano: tr('Piano'),
    wokale: tr('Wokal'),
    gitara_akustyczna: tr('Gitara Akustyczna'),
    gitara_elektryczna: tr('Gitara Elektryczna'),
    bas: tr('Gitara Basowa'),
    cajon: tr('Cajon/Perkusja'),
    naglospienie: tr('Nagłośnienie'),
    projekcja: tr('Projekcja'),
    transmisja: tr('Transmisja'),
    foto: tr('Fotograf'),
    video: tr('Wideo')
  };

  useEffect(() => {
    const fetchAssignment = async () => {
      if (!token) {
        setError(tr('Brak tokenu w linku'));
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`/api/public/assignment/${encodeURIComponent(token)}`);
        if (!res.ok) {
          setError(tr('Nie znaleziono przypisania'));
          setLoading(false);
          return;
        }
        const data = await res.json();
        setAssignments(data.assignments || []);
        setProgram(data.program || null);
        setStatus(data.status || null);

        if (data.status && data.status !== 'pending') {
          setAlreadyResponded(true);
        }
        // Akcja z URL tylko WYRÓŻNIA przycisk — zapis dopiero po kliknięciu (ekran potwierdzenia).
        setLoading(false);
      } catch (err) {
        console.error('Error:', err);
        setError(tr('Nie udało się wczytać zaproszenia. Sprawdź połączenie i odśwież stronę.'));
        setLoading(false);
      }
    };
    fetchAssignment();
  }, [token]);

  const handleAction = async (actionType) => {
    if (submitting) return;
    setSubmitting(actionType);
    try {
      const res = await fetch(`/api/public/assignment/${encodeURIComponent(token)}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: actionType }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || tr('Wystąpił błąd podczas zapisywania odpowiedzi'));
        return;
      }
      if (data.already) {
        setStatus(data.status);
        setAlreadyResponded(true);
        return;
      }
      setStatus(data.status || (actionType === 'accept' ? 'accepted' : 'rejected'));
      setSuccess(true);
    } catch (err) {
      console.error('Error handling action:', err);
      setError(tr('Wystąpił błąd podczas zapisywania odpowiedzi'));
    } finally {
      setSubmitting(null);
    }
  };

  // Nazwy wszystkich służb osoby (dla wyświetlenia w łączonym zaproszeniu).
  const rolesText = assignments.map((a) => a.role_label || roleNames[a.role_key] || a.role_key).join(', ');

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString(appLocale(), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-accent-primary mx-auto mb-4" />
          <p className="text-gray-600 font-medium">{tr('Przetwarzanie...')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">{tr('Błąd')}</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (alreadyResponded) {
    const isAccepted = status === 'accepted';
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${isAccepted ? 'bg-emerald-100' : 'bg-accent-secondary-lighter'}`}>
            {isAccepted ? (
              <CheckCircle className="w-8 h-8 text-emerald-600" />
            ) : (
              <XCircle className="w-8 h-8 text-accent-secondary" />
            )}
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            {tr('Już odpowiedziano')}
          </h1>
          <p className="text-gray-600">
            {isAccepted
              ? tr('To przypisanie zostało już zaakceptowane.')
              : tr('To przypisanie zostało już odrzucone.')}
          </p>
        </div>
      </div>
    );
  }

  if (success) {
    const isAccepted = status === 'accepted';
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${isAccepted ? 'bg-emerald-100' : 'bg-accent-secondary-lighter'}`}>
            {isAccepted ? (
              <CheckCircle className="w-8 h-8 text-emerald-600" />
            ) : (
              <XCircle className="w-8 h-8 text-accent-secondary" />
            )}
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            {isAccepted ? tr('Zaakceptowano!') : tr('Odrzucono')}
          </h1>
          <p className="text-gray-600">
            {isAccepted
              ? tr('Dziękujemy! Twój dyżur jest potwierdzony.')
              : tr('Dziękujemy za informację. Usunęliśmy Cię z grafiku.')}
          </p>

          <div className="mt-6 p-4 bg-gray-50 rounded-xl text-left">
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
              <Calendar size={16} />
              <span>{formatDate(program?.date)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
              <Music size={16} />
              <span>{rolesText}</span>
            </div>
            {assignedByName && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <User size={16} />
                <span>{tr('Przypisał:')} {assignedByName}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Ekran potwierdzenia: zawsze wymaga kliknięcia. Akcja z linku w mailu jest wyróżniona.
  const acceptBtn = (
    <button
      type="button"
      onClick={() => handleAction('accept')}
      disabled={!!submitting}
      className={`w-full py-3 px-4 font-bold rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-wait ${intent === 'reject'
        ? 'border-2 border-emerald-500 text-emerald-700 hover:bg-emerald-50'
        : 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg hover:shadow-emerald-500/30'}`}
    >
      {submitting === 'accept' ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle size={20} />}
      {intent === 'reject' ? tr('Jednak mogę — akceptuję') : tr('Akceptuję')}
    </button>
  );
  const rejectBtn = (
    <button
      type="button"
      onClick={() => handleAction('reject')}
      disabled={!!submitting}
      className={`w-full py-3 px-4 font-bold rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-wait ${intent === 'reject'
        ? 'bg-gradient-to-r from-accent-secondary-light to-red-500 hover:from-accent-secondary hover:to-red-600 text-white shadow-lg hover:shadow-red-500/30'
        : 'border-2 border-red-300 text-red-700 hover:bg-red-50'}`}
    >
      {submitting === 'reject' ? <Loader2 size={20} className="animate-spin" /> : <XCircle size={20} />}
      {intent === 'reject' ? tr('Tak, odrzucam') : tr('Odrzucam')}
    </button>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-accent-primary-light to-accent-secondary-light rounded-2xl flex items-center justify-center mx-auto mb-4 text-white">
            <Music size={32} />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            {tr('Zaproszenie do służby')}
          </h1>
          {assignedByName && (
            <p className="text-gray-600">
              {tr('Nowy dyżur od: {name}', { name: assignedByName })}
            </p>
          )}
          {intent === 'reject' && (
            <p className="mt-3 text-sm text-gray-700 bg-red-50 rounded-lg px-3 py-2">
              {tr('Czy na pewno chcesz odrzucić? Twoje imię zniknie z grafiku na ten dzień.')}
            </p>
          )}
          {intent === 'accept' && (
            <p className="mt-3 text-sm text-gray-700 bg-emerald-50 rounded-lg px-3 py-2">
              {tr('Potwierdź, że możesz służyć w tym terminie.')}
            </p>
          )}
        </div>

        <div className="bg-gray-50 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-3 mb-3">
            <Calendar className="text-accent-primary" size={20} />
            <div>
              <p className="text-sm text-gray-500">{tr('Data')}</p>
              <p className="font-medium text-gray-800">{formatDate(program?.date)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <Music className="text-accent-primary" size={20} />
            <div>
              <p className="text-sm text-gray-500">{tr('Służba')}</p>
              <p className="font-medium text-gray-800">{rolesText}</p>
            </div>
          </div>
          {program?.title && (
            <div className="flex items-center gap-3">
              <User className="text-accent-primary" size={20} />
              <div>
                <p className="text-sm text-gray-500">{tr('Wydarzenie')}</p>
                <p className="font-medium text-gray-800">{program.title}</p>
              </div>
            </div>
          )}
        </div>

        {/* Akcja z maila na górze; druga opcja pod nią. */}
        <div className="space-y-3">
          {intent === 'reject' ? <>{rejectBtn}{acceptBtn}</> : <>{acceptBtn}{rejectBtn}</>}
        </div>
      </div>
    </div>
  );
}
