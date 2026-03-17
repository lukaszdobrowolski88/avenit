import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { CheckCircle, XCircle, Loader2, AlertCircle, Calendar, User, Music } from 'lucide-react';

export default function AssignmentResponsePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const action = searchParams.get('action');

  const [loading, setLoading] = useState(true);
  const [assignment, setAssignment] = useState(null);
  const [program, setProgram] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [alreadyResponded, setAlreadyResponded] = useState(false);

  // Mapowanie kluczy ról na czytelne nazwy
  const roleNames = {
    lider: 'Lider Uwielbienia',
    piano: 'Piano',
    wokale: 'Wokal',
    gitara_akustyczna: 'Gitara Akustyczna',
    gitara_elektryczna: 'Gitara Elektryczna',
    bas: 'Gitara Basowa',
    cajon: 'Cajon/Perkusja',
    naglospienie: 'Nagłośnienie',
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
        // Pobierz przypisanie
        const { data: assignmentData, error: assignmentError } = await supabase
          .from('schedule_assignments')
          .select('*')
          .eq('token', token)
          .single();

        if (assignmentError || !assignmentData) {
          setError('Nie znaleziono przypisania');
          setLoading(false);
          return;
        }

        // Sprawdź czy już odpowiedziano
        if (assignmentData.status !== 'pending') {
          setAlreadyResponded(true);
          setAssignment(assignmentData);
        } else {
          setAssignment(assignmentData);
        }

        // Pobierz dane programu
        const { data: programData } = await supabase
          .from('programs')
          .select('date, title')
          .eq('id', assignmentData.program_id)
          .single();

        if (programData) {
          setProgram(programData);
        }

        // Jeśli jest akcja i przypisanie jest pending - wykonaj akcję
        if (action && assignmentData.status === 'pending') {
          await handleAction(action, token, assignmentData);
        }

        setLoading(false);
      } catch (err) {
        console.error('Error:', err);
        setError('Wystąpił błąd podczas przetwarzania');
        setLoading(false);
      }
    };

    fetchAssignment();
  }, [token, action]);

  const handleAction = async (actionType, tokenValue, assignmentData) => {
    try {
      const newStatus = actionType === 'accept' ? 'accepted' : 'rejected';

      const { error: updateError } = await supabase
        .from('schedule_assignments')
        .update({
          status: newStatus,
          responded_at: new Date().toISOString()
        })
        .eq('token', tokenValue);

      if (updateError) throw updateError;

      // Jeśli odrzucono - usuń z grafiku programu
      if (actionType === 'reject' && assignmentData) {
        const { data: programData } = await supabase
          .from('programs')
          .select('zespol')
          .eq('id', assignmentData.program_id)
          .single();

        if (programData?.zespol) {
          const zespol = { ...programData.zespol };
          const roleKey = assignmentData.role_key;
          const currentValue = zespol[roleKey] || '';
          const names = currentValue.split(',').map(s => s.trim()).filter(Boolean);
          const newNames = names.filter(n => n !== assignmentData.assigned_name);
          zespol[roleKey] = newNames.join(', ');

          await supabase
            .from('programs')
            .update({ zespol })
            .eq('id', assignmentData.program_id);
        }
      }

      setSuccess(true);
      setAssignment(prev => ({ ...prev, status: newStatus }));
    } catch (err) {
      console.error('Error handling action:', err);
      setError('Wystąpił błąd podczas zapisywania odpowiedzi');
    }
  };

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
          <Loader2 className="w-12 h-12 animate-spin text-pink-600 mx-auto mb-4" />
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
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Błąd</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (alreadyResponded) {
    const isAccepted = assignment?.status === 'accepted';
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${isAccepted ? 'bg-emerald-100' : 'bg-orange-100'}`}>
            {isAccepted ? (
              <CheckCircle className="w-8 h-8 text-emerald-600" />
            ) : (
              <XCircle className="w-8 h-8 text-orange-600" />
            )}
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            Już odpowiedziano
          </h1>
          <p className="text-gray-600">
            {isAccepted
              ? 'To przypisanie zostało już zaakceptowane.'
              : 'To przypisanie zostało już odrzucone.'}
          </p>
        </div>
      </div>
    );
  }

  if (success) {
    const isAccepted = assignment?.status === 'accepted';
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${isAccepted ? 'bg-emerald-100' : 'bg-orange-100'}`}>
            {isAccepted ? (
              <CheckCircle className="w-8 h-8 text-emerald-600" />
            ) : (
              <XCircle className="w-8 h-8 text-orange-600" />
            )}
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            {isAccepted ? 'Zaakceptowano!' : 'Odrzucono'}
          </h1>
          <p className="text-gray-600">
            {isAccepted
              ? 'Dziękujemy za potwierdzenie. Jesteś zapisany/a do służby!'
              : 'Dziękujemy za informację. Zostałeś/aś usunięty/a z grafiku.'}
          </p>

          <div className="mt-6 p-4 bg-gray-50 rounded-xl text-left">
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
              <Calendar size={16} />
              <span>{formatDate(program?.date)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
              <Music size={16} />
              <span>{roleNames[assignment?.role_key] || assignment?.role_key}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <User size={16} />
              <span>Przypisał: {assignment?.assigned_by_name}</span>
            </div>
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
          <div className="w-16 h-16 bg-gradient-to-br from-pink-500 to-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4 text-white">
            <Music size={32} />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            Zaproszenie do służby
          </h1>
          <p className="text-gray-600">
            {assignment?.assigned_by_name} przypisał/a Cię do służby
          </p>
        </div>

        <div className="bg-gray-50 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-3 mb-3">
            <Calendar className="text-pink-600" size={20} />
            <div>
              <p className="text-sm text-gray-500">Data</p>
              <p className="font-medium text-gray-800">{formatDate(program?.date)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <Music className="text-pink-600" size={20} />
            <div>
              <p className="text-sm text-gray-500">Służba</p>
              <p className="font-medium text-gray-800">{roleNames[assignment?.role_key] || assignment?.role_key}</p>
            </div>
          </div>
          {program?.title && (
            <div className="flex items-center gap-3">
              <User className="text-pink-600" size={20} />
              <div>
                <p className="text-sm text-gray-500">Program</p>
                <p className="font-medium text-gray-800">{program.title}</p>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <button
            onClick={() => handleAction('accept', token, assignment)}
            className="w-full py-3 px-4 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold rounded-xl shadow-lg hover:shadow-emerald-500/30 transition flex items-center justify-center gap-2"
          >
            <CheckCircle size={20} />
            Akceptuję
          </button>
          <button
            onClick={() => handleAction('reject', token, assignment)}
            className="w-full py-3 px-4 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-bold rounded-xl shadow-lg hover:shadow-red-500/30 transition flex items-center justify-center gap-2"
          >
            <XCircle size={20} />
            Odrzucam
          </button>
        </div>
      </div>
    </div>
  );
}
