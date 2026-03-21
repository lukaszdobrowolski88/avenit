import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useCampusQuery } from '../../hooks/useCampusQuery';
import {
  Plus, Search, History, ArrowUpDown, Copy, Trash2,
  ChevronUp, ChevronDown, Calendar
} from 'lucide-react';

export default function ProgramsList() {
  const navigate = useNavigate();
  const { withCampusFilter, selectedCampusId, campusIdForInsert } = useCampusQuery();
  const [programs, setPrograms] = useState([]);
  const [filter, setFilter] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [sortOrder, setSortOrder] = useState('asc');

  useEffect(() => {
    fetchPrograms();
  }, [selectedCampusId]);

  const fetchPrograms = async () => {
    const { data } = await withCampusFilter(supabase.from('programs').select('*')).order('date', { ascending: false });
    setPrograms(data || []);
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (window.confirm('Czy na pewno chcesz usunąć ten program?')) {
      await supabase.from('programs').delete().eq('id', id);
      fetchPrograms();
    }
  };

  const handleDuplicate = async (program, e) => {
    e.stopPropagation();
    const { id, ...rest } = program;
    const newProgram = {
      ...rest,
      date: new Date().toISOString().split('T')[0],
      campus_id: campusIdForInsert
    };
    const { data } = await supabase.from('programs').insert([newProgram]).select();
    if (data && data[0]) {
      navigate(`/programs/${data[0].id}`);
    }
  };

  const filteredPrograms = programs.filter(p => {
    const search = filter.toLowerCase();
    return (
      (p.date || '').toLowerCase().includes(search) ||
      (p.title || '').toLowerCase().includes(search)
    );
  });

  const today = new Date().toISOString().split('T')[0];

  const sortPrograms = (list) => {
    return [...list].sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });
  };

  const upcomingPrograms = sortPrograms(filteredPrograms.filter(p => p.date >= today));
  const pastPrograms = sortPrograms(filteredPrograms.filter(p => p.date < today));

  const formatDateFull = (dateString) => {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const date = new Date(dateString);
    const formatted = date.toLocaleDateString('pl-PL', options);
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  };

  const ProgramCard = ({ p }) => (
    <div
      onClick={() => navigate(`/programs/${p.id}`)}
      className="p-4 sm:p-5 rounded-2xl border cursor-pointer transition group relative overflow-hidden bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl border-white/40 dark:border-gray-700/50 hover:bg-white dark:hover:bg-gray-800 hover:shadow-lg hover:shadow-accent-primary-light/10 hover:border-accent-primary-lighter dark:hover:border-accent-primary-dark"
    >
      <div className="flex justify-between items-start">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-accent-primary-light to-accent-secondary-light rounded-xl flex items-center justify-center text-white shadow-lg shadow-accent-primary-light/20">
            <Calendar size={24} />
          </div>
          <div>
            <div className="font-bold text-base sm:text-lg text-gray-800 dark:text-white mb-1">
              {p.date ? formatDateFull(p.date) : 'Brak daty'}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 font-medium bg-gray-100/50 dark:bg-gray-700/50 px-2 py-1 rounded-lg inline-block">
              {p.schedule?.length || 0} elementów w programie
            </div>
          </div>
        </div>
        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition duration-200">
          <button
            onClick={(e) => handleDuplicate(p, e)}
            className="p-2 bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light rounded-xl hover:bg-accent-primary-lighter dark:hover:bg-accent-primary-darkest/50 transition"
            title="Duplikuj"
          >
            <Copy size={18} />
          </button>
          <button
            onClick={(e) => handleDelete(p.id, e)}
            className="p-2 bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/50 transition"
            title="Usuń"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 -m-4 lg:-m-6 p-4 md:p-6 lg:p-8">
      <div>
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-accent-primary to-accent-secondary dark:from-accent-primary-light dark:to-accent-secondary-light bg-clip-text text-transparent mb-2">
            Programy Nabożeństw
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm sm:text-base">
            Zarządzaj programami niedzielnych nabożeństw
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              placeholder="Szukaj programów..."
              className="w-full pl-11 pr-4 py-3 bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl text-sm focus:ring-2 focus:ring-accent-primary-light/20 outline-none text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600"
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
          </div>
          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="px-4 py-3 bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 hover:shadow-sm transition flex items-center gap-2"
          >
            <ArrowUpDown size={18} />
            <span className="sm:hidden">Sortuj</span>
          </button>
          <button
            onClick={() => navigate('/programs/new')}
            className="bg-gradient-to-r from-accent-primary to-accent-secondary dark:from-accent-primary-light dark:to-accent-secondary-light text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:shadow-accent-primary-light/30 transition transform hover:-translate-y-0.5 flex items-center justify-center gap-2"
          >
            <Plus size={18} />
            <span>Nowy Program</span>
          </button>
        </div>

        {/* Upcoming Programs */}
        <div className="mb-8">
          <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            Nadchodzące
          </h2>
          {upcomingPrograms.length === 0 ? (
            <div className="text-center py-12 bg-white/40 dark:bg-gray-800/40 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700">
              <Calendar size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-gray-500 dark:text-gray-400">Brak zaplanowanych programów</p>
              <button
                onClick={() => navigate('/programs/new')}
                className="mt-4 text-accent-primary dark:text-accent-primary-light font-medium hover:underline"
              >
                Utwórz pierwszy program
              </button>
            </div>
          ) : (
            <div className="grid gap-3">
              {upcomingPrograms.map(p => <ProgramCard key={p.id} p={p} />)}
            </div>
          )}
        </div>

        {/* History */}
        <div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4 hover:text-accent-primary dark:hover:text-accent-primary-light transition"
          >
            <History size={16} />
            Historia ({pastPrograms.length})
            {showHistory ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {showHistory && (
            <div className="grid gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
              {pastPrograms.map(p => <ProgramCard key={p.id} p={p} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
