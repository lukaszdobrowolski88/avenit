import { useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import FormRenderer from './FormRenderer';
import { tr } from '../../../i18n';
import { toast } from '../../../lib/toast';
import Modal from '../../../components/Modal';

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
    toast.success(tr('To jest tylko podgląd. Formularz nie został wysłany.'));
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      closeOnBackdrop={false}
      title={tr('Podgląd formularza')}
      size="xl"
      bodyClassName="bg-gray-100 dark:bg-gray-900"
    >
      <div className="flex justify-center px-6 pt-4">
        <div className="flex items-center gap-1 p-1 bg-gray-200 dark:bg-gray-700 rounded-lg">
          <button
            onClick={() => setViewMode('desktop')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'desktop'
                ? 'bg-white dark:bg-gray-600 text-accent-primary dark:text-accent-primary-light shadow-sm'
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
                ? 'bg-white dark:bg-gray-600 text-accent-primary dark:text-accent-primary-light shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Smartphone size={16} />
            Mobile
          </button>
        </div>
      </div>

      <div className="p-6">
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
            className={`bg-gradient-to-br from-accent-primary-lightest/50 via-white to-accent-secondary-lightest/50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 ${
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
    </Modal>
  );
}
