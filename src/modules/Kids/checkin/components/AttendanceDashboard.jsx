import React, { useState } from 'react';
import { useAttendance } from '../hooks/useAttendance';
import { ClipboardList, LayoutGrid, RefreshCw, Search, Loader2, LogOut } from 'lucide-react';
import { tr, appLocale } from '../../../../i18n';
import NotifyParentButton from './NotifyParentButton';
import EmptyState from '../../../../components/EmptyState';
import { DataTable, THead, TH, TR, TD, EmptyRow, StatusPill, STATUS_COLORS } from '../../../../components/ui/DataTable';
import { useCheckin } from '../hooks/useCheckin';
import { confirmDialog } from '../../../../lib/dialog';
import { toast } from '../../../../lib/toast';

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
  const { checkOut } = useCheckin();
  const [checkingOutId, setCheckingOutId] = useState(null);

  // Wydanie ręczne (rodzic bez naklejki albo stary kod z telefonu) — po sprawdzeniu tożsamości.
  const handleManualCheckout = async (checkin) => {
    const name = checkin.is_guest ? checkin.guest_name : checkin.kids_students?.full_name;
    const ok = await confirmDialog({
      title: tr('Wydać dziecko: {name}?', { name: name || tr('Dziecko') }),
      message: tr('Użyj tylko po sprawdzeniu, że odbiera rodzic lub upoważniony opiekun.'),
      confirmLabel: tr('Wydaj dziecko'),
      danger: false,
    });
    if (!ok) return;
    setCheckingOutId(checkin.id);
    try {
      const row = await checkOut(checkin.id);
      if (row) {
        toast.success(tr('Wydano: {name}', { name: name || tr('Dziecko') }));
        refresh();
      } else {
        toast.error(tr('Nie udało się oznaczyć odbioru. Spróbuj ponownie.'));
      }
    } finally {
      setCheckingOutId(null);
    }
  };

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

  // Zapełnienie sali w kolorze marki; czerwień dopiero, gdy sala jest pełna.
  const getFillColor = (percentage) => {
    if (percentage === null) return 'bg-gray-200 dark:bg-gray-700';
    if (percentage < 100) return 'bg-accent-primary';
    return 'bg-red-500';
  };

  const getFillTextColor = (percentage) => {
    if (percentage === null || percentage < 100) return 'text-gray-900 dark:text-white';
    return 'text-red-600 dark:text-red-400';
  };

  if (!session) {
    return (
      <EmptyState
        icon={ClipboardList}
        title={tr('Dziś nikt nie jest jeszcze zameldowany')}
        subtitle={tr('Lista obecności pojawi się po pierwszym meldowaniu dziecka.')}
      />
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {tr('Lista obecności')}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {tr('Aktualnie obecnych:')} <strong className="text-accent-primary dark:text-accent-primary-light">{activeCheckins.length}</strong>
          </p>
        </div>

        {/* View toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setView('list')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl transition
              ${view === 'list'
                ? 'bg-gradient-to-r from-accent-primary to-accent-secondary text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
          >
            <ClipboardList size={18} />
            {tr('Lista')}
          </button>
          <button
            onClick={() => setView('rooms')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl transition
              ${view === 'rooms'
                ? 'bg-gradient-to-r from-accent-primary to-accent-secondary text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
          >
            <LayoutGrid size={18} />
            {tr('Sale')}
          </button>
          <button
            onClick={refresh}
            disabled={loading}
            aria-label={tr('Odśwież')}
            title={tr('Odśwież')}
            className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Rooms view */}
      {view === 'rooms' && locationStats.length === 0 && (
        <EmptyState
          icon={LayoutGrid}
          title={tr('Nie ma jeszcze sal ani zameldowanych dzieci')}
          subtitle={tr('Sale dodasz w zakładce Ustawienia → Sale.')}
        />
      )}
      {view === 'rooms' && locationStats.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {locationStats.map((loc) => (
            <div
              key={loc.id}
              className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-5 transition hover:border-accent-primary-light dark:hover:border-accent-primary"
            >
              {/* Room header */}
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {loc.name}
                  </h3>
                  {loc.room_number && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {tr('Pokój {n}', { n: loc.room_number })}
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
                          <span className="ml-1.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-1.5 py-0.5 rounded text-[11px] font-bold">
                            {tr('Gość')}
                          </span>
                        )}
                      </span>
                      <span className="text-accent-primary dark:text-accent-primary-light font-semibold">
                        {child.securityCode}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState compact title={tr('Brak dzieci w tej sali')} />
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
              className="px-4 py-2.5 text-sm border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-accent-primary-light dark:focus:border-accent-primary-light focus:outline-none transition"
            >
              <option value="active">{tr('Obecni')} ({activeCheckins.length})</option>
              <option value="checkedout">{tr('Odebrani')} ({checkedOutCheckins.length})</option>
              <option value="all">{tr('Wszyscy')} ({checkins.length})</option>
            </select>

            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="px-4 py-2.5 text-sm border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-accent-primary-light dark:focus:border-accent-primary-light focus:outline-none transition"
            >
              <option value="all">{tr('Wszystkie sale')}</option>
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
                placeholder={tr('Szukaj po imieniu lub kodzie...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-sm border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:border-accent-primary-light dark:focus:border-accent-primary-light focus:outline-none transition"
              />
            </div>
          </div>

          {/* Table */}
          <DataTable>
            <THead>
              <tr>
                <TH>{tr('Imię')}</TH>
                <TH>{tr('Sala')}</TH>
                <TH>{tr('Kod odbioru')}</TH>
                <TH>{tr('Zameldowano')}</TH>
                <TH>{tr('Status')}</TH>
                <TH align="right"><span className="sr-only">{tr('Akcje')}</span></TH>
              </tr>
            </THead>
            <tbody>
              {filteredCheckins.length === 0 ? (
                <EmptyRow colSpan={6}>
                  {checkins.length === 0 ? tr('Nikt nie jest jeszcze zameldowany w tej sesji.') : tr('Żadne meldowanie nie pasuje do filtrów.')}
                </EmptyRow>
              ) : (
                filteredCheckins.map((checkin) => {
                  const name = checkin.is_guest
                    ? checkin.guest_name
                    : checkin.kids_students?.full_name;
                  const isCheckedOut = !!checkin.checked_out_at;

                  return (
                    <TR
                      key={checkin.id}
                      className={isCheckedOut ? 'opacity-60' : ''}
                    >
                      <TD className="font-medium text-gray-900 dark:text-white">
                        <div className="flex items-center gap-2">
                          {name}
                          {checkin.is_guest && (
                            <StatusPill color={STATUS_COLORS.neutral}>{tr('Gość')}</StatusPill>
                          )}
                        </div>
                      </TD>
                      <TD>
                        {checkin.checkin_locations?.name}
                        {checkin.checkin_locations?.room_number && (
                          <span className="text-gray-500 dark:text-gray-400">
                            {' '}({checkin.checkin_locations.room_number})
                          </span>
                        )}
                      </TD>
                      <TD numeric>
                        <span className="text-accent-primary dark:text-accent-primary-light font-semibold text-base">
                          {checkin.security_code}
                        </span>
                      </TD>
                      <TD muted numeric>
                        {new Date(checkin.checked_in_at).toLocaleTimeString(appLocale(), {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </TD>
                      <TD>
                        {isCheckedOut ? (
                          <StatusPill color={STATUS_COLORS.neutral} className="tabular-nums">
                            {tr('Odebrany')}{' '}
                            {new Date(checkin.checked_out_at).toLocaleTimeString(appLocale(), {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </StatusPill>
                        ) : (
                          <StatusPill color={STATUS_COLORS.accent}>
                            {tr('Obecny')}
                          </StatusPill>
                        )}
                      </TD>
                      <TD align="right">
                        {!isCheckedOut && (
                          <div className="flex justify-end gap-2">
                            <NotifyParentButton checkin={checkin} sessionId={session?.id} />
                            <button
                              type="button"
                              onClick={() => handleManualCheckout(checkin)}
                              disabled={checkingOutId === checkin.id}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition disabled:opacity-50"
                            >
                              {checkingOutId === checkin.id ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
                              {tr('Wydaj')}
                            </button>
                          </div>
                        )}
                      </TD>
                    </TR>
                  );
                })
              )}
            </tbody>
          </DataTable>
        </>
      )}

      {loading && (
        <div className="fixed bottom-5 right-5 bg-accent-primary text-white px-5 py-3 rounded-xl flex items-center gap-2 shadow-lg">
          <Loader2 size={18} className="animate-spin" />
          {tr('Odświeżanie...')}
        </div>
      )}
    </div>
  );
}
