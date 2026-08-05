import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2, AlertCircle, Calendar, User, Music } from 'lucide-react';
import { tr } from '../../i18n';

// Strona akceptacji/odrzucenia zaproszenia do służby. Zaproszony jest NIEzalogowany —
// autoryzuje sam token z linku w mailu. Dane idą przez publiczne endpointy
// /api/public/assignment/:token (odczyt) i .../respond (accept/reject), NIE przez /api/db
// (który wymaga logowania).
export default function AssignmentResponsePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const action = searchParams.get('action');

  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState([]); // wspólny token = wiele służb
  const [program, setProgram] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [alreadyResponded, setAlreadyResponded] = useState(false);

  const assignedByName = assignments[0]?.assigned_by_name;

  const roleNames = {
    lider: 'Lider Uwielbienia',
    piano: 'Piano',
    wokale: 'Wokal',
    gitara_akustyczna: 'Gitara Akustyczna',
    gitara_elektryczna: 'Gitara Elektryczna',
    bas: 'Gitara Basowa',
    cajon: 'Cajon/Perkusja',
    naglospienie: tr('Nagłośnienie'),
    projekcja: 'Projekcja',
    transmisja: 'Transmisja',
    foto: 'Fotograf',
    video: 'Wideo'
  };

  useEffect(() => {
    const fetchAssignment = async () => {
      if (!token) {
        setError('Brak tokenu w linku');
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`/api/public/assignment/${encodeURIComponent(token)}`);
        if (!res.ok) {
          setError('Nie znaleziono przypisania');
          setLoading(false);
          return;
        }
        const data = await res.json();
        setAssignments(data.assignments || []);
        setProgram(data.program || null);
        setStatus(data.status || null);

        if (data.status && data.status !== 'pending') {
          setAlreadyResponded(true);
          setLoading(false);
          return;
        }

        // Akcja w URL (przyciski z maila) — wykonaj od razu.
        if (action === 'accept' || action === 'reject') {
          await handleAction(action);
        }
        setLoading(false);
      } catch (err) {
        console.error('Error:', err);
        setError(tr('Wystąpił błąd podczas przetwarzania'));
        setLoading(false);
      }
    };
    fetchAssignment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, action]);

  const handleAction = async (actionType) => {
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
    }
  };

  // Nazwy wszystkich służb osoby (dla wyświetlenia w łączonym zaproszeniu).
  const rolesText = assignments.map((a) => roleNames[a.role_key] || a.role_key).join(', ');

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('pl-PL', {
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
          <p className="text-gray-600 font-medium">Przetwarzanie...</p>
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
            {isAccepted ? 'Zaakceptowano!' : 'Odrzucono'}
          </h1>
          <p className="text-gray-600">
            {isAccepted
              ? tr('Dziękujemy za potwierdzenie. Jesteś zapisany/a do służby!')
              : tr('Dziękujemy za informację. Zostałeś/aś usunięty/a z grafiku.')}
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
                <span>Przypisał: {assignedByName}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Widok z przyciskami do wyboru (jeśli nie ma akcji w URL)
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
              {assignedByName} przypisał/a Cię do służby
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
                <p className="text-sm text-gray-500">Program</p>
                <p className="font-medium text-gray-800">{program.title}</p>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <button
            onClick={() => handleAction('accept')}
            className="w-full py-3 px-4 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold rounded-xl shadow-lg hover:shadow-emerald-500/30 transition flex items-center justify-center gap-2"
          >
            <CheckCircle size={20} />
            {tr('Akceptuję')}
          </button>
          <button
            onClick={() => handleAction('reject')}
            className="w-full py-3 px-4 bg-gradient-to-r from-accent-secondary-light to-red-500 hover:from-accent-secondary hover:to-red-600 text-white font-bold rounded-xl shadow-lg hover:shadow-red-500/30 transition flex items-center justify-center gap-2"
          >
            <XCircle size={20} />
            Odrzucam
          </button>
        </div>
      </div>
    </div>
  );
}
