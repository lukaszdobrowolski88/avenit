import React, { useState } from 'react';
import { useAttendance } from '../hooks/useAttendance';
import { ClipboardList, LayoutGrid, RefreshCw, Search, Loader2 } from 'lucide-react';

export default function AttendanceDashboard({ session, locations }) {
  const [view, setView] = useState('list');
  const [filter, setFilter] = useState('active');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('all');

  const {
    checkins,
    activeCheckins,
    checkedOutCheckins,
    locationStats,
    loading,
    refresh
  } = useAttendance(session?.id);

  const getFilteredCheckins = () => {
    let filtered = [];

    if (filter === 'active') {
      filtered = activeCheckins;
    } else if (filter === 'checkedout') {
      filtered = checkedOutCheckins;
    } else {
      filtered = checkins;
    }

    if (selectedLocation !== 'all') {
      filtered = filtered.filter(c => c.location_id === selectedLocation);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(c => {
        const name = c.is_guest ? c.guest_name : c.kids_students?.full_name;
        return name?.toLowerCase().includes(term) ||
          c.security_code?.toLowerCase().includes(term);
      });
    }

    return filtered;
  };

  const filteredCheckins = getFilteredCheckins();

  const getFillColor = (percentage) => {
    if (percentage === null) return 'bg-gray-200 dark:bg-gray-700';
    if (percentage < 70) return 'bg-green-500';
    if (percentage < 90) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getFillTextColor = (percentage) => {
    if (percentage === null) return 'text-gray-400 dark:text-gray-500';
    if (percentage < 70) return 'text-green-600 dark:text-green-400';
    if (percentage < 90) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  if (!session) {
    return (
      <div className="p-10 text-center text-gray-500 dark:text-gray-400">
        Brak aktywnej sesji. Przejdź do ustawień, aby utworzyć sesję.
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Lista obecności
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Aktualnie obecnych: <strong className="text-pink-600 dark:text-pink-400">{activeCheckins.length}</strong>
          </p>
        </div>

        {/* View toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setView('list')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl transition
              ${view === 'list'
                ? 'bg-gradient-to-r from-pink-600 to-orange-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
          >
            <ClipboardList size={18} />
            Lista
          </button>
          <button
            onClick={() => setView('rooms')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl transition
              ${view === 'rooms'
                ? 'bg-gradient-to-r from-pink-600 to-orange-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
          >
            <LayoutGrid size={18} />
            Sale
          </button>
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Rooms view */}
      {view === 'rooms' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {locationStats.map((loc) => (
            <div
              key={loc.id}
              className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-5 transition hover:border-pink-300 dark:hover:border-pink-600"
            >
              {/* Room header */}
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {loc.name}
                  </h3>
                  {loc.room_number && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      Sala {loc.room_number}
                    </span>
                  )}
                </div>
                <div className={`text-2xl font-bold ${getFillTextColor(loc.fillPercentage)}`}>
                  {loc.currentCount}
                  {loc.capacity && (
                    <span className="text-base text-gray-400 dark:text-gray-500">/{loc.capacity}</span>
                  )}
                </div>
              </div>

              {/* Fill bar */}
              {loc.capacity && (
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-3">
                  <div
                    className={`h-full ${getFillColor(loc.fillPercentage)} transition-all duration-300`}
                    style={{ width: `${Math.min(loc.fillPercentage || 0, 100)}%` }}
                  />
                </div>
              )}

              {/* Children list */}
              {loc.children.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {loc.children.map((child) => (
                    <div
                      key={child.id}
                      className="flex justify-between items-center px-3 py-2 bg-gray-50 dark:bg-gray-900 rounded-lg text-sm"
                    >
                      <span className="text-gray-900 dark:text-gray-100">
                        {child.name}
                        {child.isGuest && (
                          <span className="ml-1.5 bg-amber-400 dark:bg-amber-500 text-black px-1.5 py-0.5 rounded text-[10px] font-bold">
                            GOŚĆ
                          </span>
                        )}
                      </span>
                      <span className="text-pink-600 dark:text-pink-400 font-semibold">
                        {child.securityCode}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-sm text-gray-400 dark:text-gray-500 py-2">
                  Brak dzieci w tej sali
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* List view */}
      {view === 'list' && (
        <>
          {/* Filters */}
          <div className="flex gap-4 mb-5 flex-wrap">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="px-4 py-2.5 text-sm border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-pink-500 dark:focus:border-pink-400 focus:outline-none transition"
            >
              <option value="active">Obecni ({activeCheckins.length})</option>
              <option value="checkedout">Odebrani ({checkedOutCheckins.length})</option>
              <option value="all">Wszyscy ({checkins.length})</option>
            </select>

            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="px-4 py-2.5 text-sm border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-pink-500 dark:focus:border-pink-400 focus:outline-none transition"
            >
              <option value="all">Wszystkie sale</option>
              {locations?.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>

            <div className="relative flex-1 min-w-[250px]">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Szukaj po imieniu lub kodzie..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-sm border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:border-pink-500 dark:focus:border-pink-400 focus:outline-none transition"
              />
            </div>
          </div>

          {/* Table */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Imię</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sala</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Kod</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Check-in</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredCheckins.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-gray-400 dark:text-gray-500">
                        Brak wyników
                      </td>
                    </tr>
                  ) : (
                    filteredCheckins.map((checkin) => {
                      const name = checkin.is_guest
                        ? checkin.guest_name
                        : checkin.kids_students?.full_name;
                      const isCheckedOut = !!checkin.checked_out_at;

                      return (
                        <tr
                          key={checkin.id}
                          className={`hover:bg-gray-50 dark:hover:bg-gray-900 transition ${isCheckedOut ? 'opacity-60' : ''}`}
                        >
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                            <div className="flex items-center gap-2">
                              {name}
                              {checkin.is_guest && (
                                <span className="bg-amber-400 dark:bg-amber-500 text-black px-1.5 py-0.5 rounded text-[10px] font-bold">
                                  GOŚĆ
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                            {checkin.checkin_locations?.name}
                            {checkin.checkin_locations?.room_number && (
                              <span className="text-gray-500 dark:text-gray-500">
                                {' '}({checkin.checkin_locations.room_number})
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-pink-600 dark:text-pink-400 font-semibold text-base">
                              {checkin.security_code}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                            {new Date(checkin.checked_in_at).toLocaleTimeString('pl-PL', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </td>
                          <td className="px-4 py-3">
                            {isCheckedOut ? (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                                Odebrany{' '}
                                {new Date(checkin.checked_out_at).toLocaleTimeString('pl-PL', {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">
                                Obecny
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {loading && (
        <div className="fixed bottom-5 right-5 bg-pink-600 text-white px-5 py-3 rounded-xl flex items-center gap-2 shadow-lg">
          <Loader2 size={18} className="animate-spin" />
          Odświeżanie...
        </div>
      )}
    </div>
  );
}
