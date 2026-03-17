import { useState } from 'react';
import { X, Monitor, Smartphone } from 'lucide-react';
import FormRenderer from './FormRenderer';

export default function FormPreview({
  title,
  description,
  fields,
  settings,
  onClose
}) {
  const [viewMode, setViewMode] = useState('desktop');

  const handlePreviewSubmit = (answers) => {
    console.log('Preview submit:', answers);
    alert('To jest tylko podgląd. Formularz nie został wysłany.');
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-100 dark:bg-gray-900 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <h2 className="font-semibold text-gray-900 dark:text-white">
              Podgląd formularza
            </h2>

            <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-700 rounded-lg">
              <button
                onClick={() => setViewMode('desktop')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'desktop'
                    ? 'bg-white dark:bg-gray-600 text-pink-600 dark:text-pink-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <Monitor size={16} />
                Desktop
              </button>
              <button
                onClick={() => setViewMode('mobile')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'mobile'
                    ? 'bg-white dark:bg-gray-600 text-pink-600 dark:text-pink-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <Smartphone size={16} />
                Mobile
              </button>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div
            className={`mx-auto transition-all ${
              viewMode === 'mobile' ? 'max-w-sm' : 'max-w-xl'
            }`}
          >
            {viewMode === 'mobile' && (
              <div className="bg-gray-800 rounded-t-3xl p-2 pb-0">
                <div className="h-6 flex items-center justify-center">
                  <div className="w-20 h-1 bg-gray-600 rounded-full"></div>
                </div>
              </div>
            )}

            <div
              className={`bg-gradient-to-br from-pink-50/50 via-white to-orange-50/50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 ${
                viewMode === 'mobile'
                  ? 'rounded-b-3xl border-x-4 border-b-4 border-gray-800 p-4'
                  : 'rounded-2xl p-6'
              }`}
              style={settings?.theme?.backgroundColor ? {
                background: settings.theme.backgroundColor
              } : {}}
            >
              <FormRenderer
                title={title}
                description={description}
                fields={fields}
                settings={settings}
                onSubmit={handlePreviewSubmit}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
