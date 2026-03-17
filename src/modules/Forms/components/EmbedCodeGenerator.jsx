import { useState } from 'react';
import { Copy, Check, Code, ExternalLink, Monitor, Smartphone, Tablet, X } from 'lucide-react';

export default function EmbedCodeGenerator({ formId, formTitle, isOpen, onClose }) {
  const [copied, setCopied] = useState(null);
  const [embedType, setEmbedType] = useState('iframe');
  const [iframeWidth, setIframeWidth] = useState('100%');
  const [iframeHeight, setIframeHeight] = useState('600');
  const [previewDevice, setPreviewDevice] = useState('desktop');

  if (!isOpen) return null;

  const baseUrl = window.location.origin;
  const formUrl = `${baseUrl}/form/${formId}`;

  const getIframeCode = () => {
    return `<iframe
  src="${formUrl}"
  width="${iframeWidth}"
  height="${iframeHeight}px"
  frameborder="0"
  style="border: none; max-width: 100%;"
  title="${formTitle || 'Formularz'}"
  allow="clipboard-write"
></iframe>`;
  };

  const getJsEmbedCode = () => {
    return `<div id="church-form-${formId}"></div>
<script>
(function() {
  var container = document.getElementById('church-form-${formId}');
  var iframe = document.createElement('iframe');
  iframe.src = '${formUrl}';
  iframe.style.width = '${iframeWidth}';
  iframe.style.height = '${iframeHeight}px';
  iframe.style.border = 'none';
  iframe.style.maxWidth = '100%';
  iframe.title = '${formTitle || 'Formularz'}';
  iframe.allow = 'clipboard-write';
  container.appendChild(iframe);

  // Auto-resize based on content
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'church-form-resize' && e.data.formId === '${formId}') {
      iframe.style.height = e.data.height + 'px';
    }
  });
})();
</script>`;
  };

  const getWordPressShortcode = () => {
    return `[church_form id="${formId}" width="${iframeWidth}" height="${iframeHeight}"]`;
  };

  const getDirectLink = () => {
    return formUrl;
  };

  const copyToClipboard = async (text, type) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('Błąd kopiowania:', err);
    }
  };

  const previewWidths = {
    desktop: '100%',
    tablet: '768px',
    mobile: '375px'
  };

  const embedOptions = [
    { id: 'iframe', label: 'Iframe', icon: Code, description: 'Prosty kod do osadzenia' },
    { id: 'js', label: 'JavaScript', icon: Code, description: 'Dynamiczne osadzenie z auto-resize' },
    { id: 'wordpress', label: 'WordPress', icon: Code, description: 'Shortcode dla WordPress' },
    { id: 'link', label: 'Link', icon: ExternalLink, description: 'Bezpośredni link do formularza' }
  ];

  const getCurrentCode = () => {
    switch (embedType) {
      case 'iframe': return getIframeCode();
      case 'js': return getJsEmbedCode();
      case 'wordpress': return getWordPressShortcode();
      case 'link': return getDirectLink();
      default: return getIframeCode();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Osadź formularz na stronie
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {formTitle || 'Formularz'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Left side - Options */}
            <div className="space-y-6">
              {/* Embed type selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Typ osadzenia
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {embedOptions.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => setEmbedType(option.id)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        embedType === option.id
                          ? 'border-pink-500 bg-pink-50 dark:bg-pink-900/30'
                          : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <option.icon size={16} className={embedType === option.id ? 'text-pink-500' : 'text-gray-400'} />
                        <span className={`text-sm font-medium ${
                          embedType === option.id ? 'text-pink-600 dark:text-pink-400' : 'text-gray-700 dark:text-gray-300'
                        }`}>
                          {option.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {option.description}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Size options (for iframe/js) */}
              {(embedType === 'iframe' || embedType === 'js') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Rozmiar
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                        Szerokość
                      </label>
                      <input
                        type="text"
                        value={iframeWidth}
                        onChange={(e) => setIframeWidth(e.target.value)}
                        placeholder="np. 100% lub 600px"
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                        Wysokość (px)
                      </label>
                      <input
                        type="number"
                        min="200"
                        max="2000"
                        value={iframeHeight}
                        onChange={(e) => setIframeHeight(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 dark:text-white"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2">
                    {[
                      { label: 'Mały', width: '400px', height: '400' },
                      { label: 'Średni', width: '100%', height: '600' },
                      { label: 'Duży', width: '100%', height: '800' }
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        onClick={() => {
                          setIframeWidth(preset.width);
                          setIframeHeight(preset.height);
                        }}
                        className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Code output */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Kod do skopiowania
                  </label>
                  <button
                    onClick={() => copyToClipboard(getCurrentCode(), 'code')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      copied === 'code'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                        : 'bg-pink-500 text-white hover:bg-pink-600'
                    }`}
                  >
                    {copied === 'code' ? (
                      <>
                        <Check size={16} />
                        Skopiowano!
                      </>
                    ) : (
                      <>
                        <Copy size={16} />
                        Kopiuj kod
                      </>
                    )}
                  </button>
                </div>
                <div className="relative">
                  <pre className="p-4 bg-gray-900 rounded-xl text-sm text-gray-300 overflow-x-auto max-h-48 font-mono">
                    <code>{getCurrentCode()}</code>
                  </pre>
                </div>
              </div>

              {/* Direct link */}
              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Bezpośredni link
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyToClipboard(formUrl, 'link')}
                      className={`p-1.5 rounded-lg transition-colors ${
                        copied === 'link'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-600'
                          : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                      }`}
                    >
                      {copied === 'link' ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                    <a
                      href={formUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                    >
                      <ExternalLink size={16} />
                    </a>
                  </div>
                </div>
                <input
                  type="text"
                  readOnly
                  value={formUrl}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300"
                />
              </div>
            </div>

            {/* Right side - Preview */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Podgląd
                </label>
                <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-700 rounded-lg">
                  {[
                    { id: 'desktop', icon: Monitor, label: 'Desktop' },
                    { id: 'tablet', icon: Tablet, label: 'Tablet' },
                    { id: 'mobile', icon: Smartphone, label: 'Mobile' }
                  ].map((device) => (
                    <button
                      key={device.id}
                      onClick={() => setPreviewDevice(device.id)}
                      className={`p-2 rounded-md transition-colors ${
                        previewDevice === device.id
                          ? 'bg-white dark:bg-gray-600 text-pink-500 shadow-sm'
                          : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                      }`}
                      title={device.label}
                    >
                      <device.icon size={16} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700 p-4 h-[400px] flex items-start justify-center">
                <div
                  className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden transition-all duration-300"
                  style={{
                    width: previewWidths[previewDevice],
                    maxWidth: '100%',
                    height: '100%'
                  }}
                >
                  <iframe
                    src={formUrl}
                    className="w-full h-full border-0"
                    title="Podgląd formularza"
                  />
                </div>
              </div>

              {/* WordPress instructions */}
              {embedType === 'wordpress' && (
                <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/30 rounded-xl">
                  <h4 className="text-sm font-medium text-blue-700 dark:text-blue-400 mb-2">
                    Instrukcje dla WordPress
                  </h4>
                  <ol className="text-sm text-blue-600 dark:text-blue-300 space-y-1 list-decimal list-inside">
                    <li>Pobierz i zainstaluj plugin Church Manager Forms</li>
                    <li>Aktywuj plugin w panelu WordPress</li>
                    <li>Wklej shortcode na dowolnej stronie lub w poście</li>
                    <li>Formularz pojawi się automatycznie</li>
                  </ol>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Formularz będzie działał na każdej stronie obsługującej iframe
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors text-sm font-medium"
            >
              Zamknij
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
