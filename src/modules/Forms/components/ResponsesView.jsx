import { useState, useEffect } from 'react';
import {
  Download,
  Trash2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  FileText,
  Calendar,
  User
} from 'lucide-react';
import { useFormResponses } from '../hooks/useFormResponses';
import { exportToCSV, exportToJSON, formatAnswerForExport } from '../utils/exportUtils';

export default function ResponsesView({ form }) {
  const [selectedResponse, setSelectedResponse] = useState(null);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const {
    responses,
    loading,
    pagination,
    fetchResponses,
    deleteResponse,
    deleteAllResponses
  } = useFormResponses(form?.id);

  useEffect(() => {
    if (form?.id) {
      fetchResponses();
    }
  }, [form?.id, fetchResponses]);

  const handleExportCSV = () => {
    exportToCSV(form, responses);
    setShowExportMenu(false);
  };

  const handleExportJSON = () => {
    exportToJSON(form, responses);
    setShowExportMenu(false);
  };

  const handleDeleteResponse = async (responseId) => {
    if (window.confirm('Czy na pewno chcesz usunąć tę odpowiedź?')) {
      await deleteResponse(responseId);
      if (selectedResponse?.id === responseId) {
        setSelectedResponse(null);
      }
    }
  };

  const handleDeleteAll = async () => {
    if (window.confirm('Czy na pewno chcesz usunąć wszystkie odpowiedzi? Ta operacja jest nieodwracalna.')) {
      await deleteAllResponses();
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('pl-PL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const totalPages = Math.ceil(pagination.total / pagination.limit);

  if (loading && responses.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500"></div>
      </div>
    );
  }

  if (responses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center p-6">
        <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
          <FileText size={32} className="text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
          Brak odpowiedzi
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Ten formularz nie otrzymał jeszcze żadnych odpowiedzi
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Łącznie odpowiedzi: <span className="font-semibold">{pagination.total}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchResponses(pagination.page)}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Odśwież
          </button>

          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <Download size={16} />
              Eksportuj
            </button>

            {showExportMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowExportMenu(false)}
                />
                <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-20">
                  <button
                    onClick={handleExportCSV}
                    className="w-full px-4 py-2 text-sm text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Eksportuj CSV
                  </button>
                  <button
                    onClick={handleExportJSON}
                    className="w-full px-4 py-2 text-sm text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Eksportuj JSON
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            onClick={handleDeleteAll}
            className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          >
            <Trash2 size={16} />
            Usuń wszystkie
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Data
                </th>
                {(form?.fields || []).slice(0, 3).map((field) => (
                  <th
                    key={field.id}
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider"
                  >
                    {field.label}
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Akcje
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {responses.map((response) => (
                <tr
                  key={response.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    {formatDate(response.submitted_at)}
                  </td>
                  {(form?.fields || []).slice(0, 3).map((field) => (
                    <td
                      key={field.id}
                      className="px-4 py-3 text-sm text-gray-900 dark:text-white max-w-xs truncate"
                    >
                      {formatAnswerForExport(response.answers[field.id], field.type) || '-'}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setSelectedResponse(response)}
                        className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                        title="Zobacz szczegóły"
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteResponse(response.id)}
                        className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title="Usuń"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Strona {pagination.page} z {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchResponses(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => fetchResponses(pagination.page + 1)}
                disabled={pagination.page >= totalPages}
                className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedResponse && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="font-semibold text-gray-900 dark:text-white">
                Szczegóły odpowiedzi
              </h2>
              <button
                onClick={() => setSelectedResponse(null)}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-1">
                  <Calendar size={14} />
                  {formatDate(selectedResponse.submitted_at)}
                </div>
                {selectedResponse.respondent_email && (
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <User size={14} />
                    {selectedResponse.respondent_email}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                {(form?.fields || []).map((field) => (
                  <div key={field.id}>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                      {field.label}
                    </p>
                    <p className="text-gray-900 dark:text-white">
                      {formatAnswerForExport(selectedResponse.answers[field.id], field.type) || (
                        <span className="text-gray-400 italic">Brak odpowiedzi</span>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => handleDeleteResponse(selectedResponse.id)}
                className="w-full flex items-center justify-center gap-2 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              >
                <Trash2 size={16} />
                Usuń odpowiedź
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
