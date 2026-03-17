import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, Save, Upload, X, Image, DollarSign, CreditCard, Trash2, Mail, Bell, Clock, Edit3, Eye, AlertCircle, Code, Palette } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useTemplates } from '../../Mailing/hooks/useTemplates';
import { DEFAULT_FORM_EMAIL_TEMPLATES, FORM_EMAIL_VARIABLES } from '../utils/formEmailTemplates';
import DragDropEmailBuilder from '../../Mailing/components/DragDropEmailBuilder';

export default function FormSettings({ settings, onUpdate, onClose }) {
  const [localSettings, setLocalSettings] = useState(settings || {});
  const [uploadingImage, setUploadingImage] = useState(null);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [editorMode, setEditorMode] = useState('visual'); // 'visual' | 'code'
  const headerImageRef = useRef(null);
  const backgroundImageRef = useRef(null);
  const logoImageRef = useRef(null);

  // Pobierz szablony emaili z modulu Mailing
  const { templates: mailingTemplates, loading: loadingTemplates } = useTemplates();

  const handleChange = (key, value) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleThemeChange = (key, value) => {
    setLocalSettings(prev => ({
      ...prev,
      theme: { ...(prev.theme || {}), [key]: value }
    }));
  };

  const handleBrandingChange = (key, value) => {
    setLocalSettings(prev => ({
      ...prev,
      branding: { ...(prev.branding || {}), [key]: value }
    }));
  };

  const handlePricingChange = (key, value) => {
    setLocalSettings(prev => ({
      ...prev,
      pricing: { ...(prev.pricing || {}), [key]: value }
    }));
  };

  const handleEmailsChange = (key, value) => {
    setLocalSettings(prev => ({
      ...prev,
      emails: { ...(prev.emails || {}), [key]: value }
    }));
  };

  const handleEmailTypeChange = (type, key, value) => {
    setLocalSettings(prev => ({
      ...prev,
      emails: {
        ...(prev.emails || {}),
        [type]: { ...(prev.emails?.[type] || {}), [key]: value }
      }
    }));
  };

  const handleImageUpload = async (file, type) => {
    if (!file) return;

    setUploadingImage(type);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `form-${type}-${Date.now()}.${fileExt}`;
      const filePath = `branding/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('form-uploads')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('form-uploads')
        .getPublicUrl(filePath);

      handleBrandingChange(`${type}Image`, publicUrl);
    } catch (error) {
      console.error('Błąd uploadu:', error);
    } finally {
      setUploadingImage(null);
    }
  };

  const handleRemoveImage = (type) => {
    handleBrandingChange(`${type}Image`, null);
  };

  const handleSave = () => {
    onUpdate(localSettings);
    onClose();
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
              Ustawienia formularza
            </h1>
          </div>

          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-pink-500 to-orange-500 text-white rounded-lg hover:shadow-lg hover:shadow-pink-500/25 transition-all"
          >
            <Save size={16} />
            Zapisz
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Wysyłanie formularza
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Tekst przycisku wysyłania
                </label>
                <input
                  type="text"
                  value={localSettings.submitButtonText || ''}
                  onChange={(e) => handleChange('submitButtonText', e.target.value)}
                  placeholder="Wyślij"
                  className="w-full px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Komunikat po wysłaniu
                </label>
                <textarea
                  value={localSettings.successMessage || ''}
                  onChange={(e) => handleChange('successMessage', e.target.value)}
                  placeholder="Dziękujemy za wypełnienie formularza!"
                  rows={3}
                  className="w-full px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Przekierowanie po wysłaniu (opcjonalne)
                </label>
                <input
                  type="url"
                  value={localSettings.redirectUrl || ''}
                  onChange={(e) => handleChange('redirectUrl', e.target.value)}
                  placeholder="https://example.com/dziekujemy"
                  className="w-full px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500"
                />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Opcje formularza
            </h2>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    Pasek postępu
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Pokaż postęp wypełniania formularza
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localSettings.showProgressBar || false}
                    onChange={(e) => handleChange('showProgressBar', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-pink-300 dark:peer-focus:ring-pink-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-pink-500"></div>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Limit odpowiedzi (opcjonalne)
                </label>
                <input
                  type="number"
                  min="1"
                  value={localSettings.limitResponses || ''}
                  onChange={(e) => handleChange('limitResponses', e.target.value ? parseInt(e.target.value) : null)}
                  placeholder="Bez limitu"
                  className="w-full px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Maksymalna liczba odpowiedzi, po której formularz zostanie zamknięty
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Wygląd
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Kolor główny
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={localSettings.theme?.primaryColor || '#ec4899'}
                    onChange={(e) => handleThemeChange('primaryColor', e.target.value)}
                    className="w-12 h-12 rounded-xl border border-gray-200 dark:border-gray-600 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={localSettings.theme?.primaryColor || '#ec4899'}
                    onChange={(e) => handleThemeChange('primaryColor', e.target.value)}
                    className="flex-1 px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500"
                    placeholder="#ec4899"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {['#ec4899', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#6b7280'].map((color) => (
                  <button
                    key={color}
                    onClick={() => handleThemeChange('primaryColor', color)}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      localSettings.theme?.primaryColor === color
                        ? 'border-gray-900 dark:border-white scale-110'
                        : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Sekcja grafiki i obrazów */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white mb-4">
              <Image size={20} className="text-pink-500" />
              Grafika i obrazy
            </h2>

            <div className="space-y-6">
              {/* Logo */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Logo formularza
                </label>
                <input
                  ref={logoImageRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e.target.files[0], 'logo')}
                  className="hidden"
                />
                {localSettings.branding?.logoImage ? (
                  <div className="relative inline-block">
                    <img
                      src={localSettings.branding.logoImage}
                      alt="Logo"
                      className="h-16 object-contain rounded-lg border border-gray-200 dark:border-gray-600"
                    />
                    <button
                      onClick={() => handleRemoveImage('logo')}
                      className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => logoImageRef.current?.click()}
                    disabled={uploadingImage === 'logo'}
                    className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-gray-600 dark:text-gray-400 hover:border-pink-500 hover:text-pink-500 transition-colors"
                  >
                    {uploadingImage === 'logo' ? (
                      <div className="w-5 h-5 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Upload size={18} />
                    )}
                    Dodaj logo
                  </button>
                )}
                <div className="mt-2 flex gap-2">
                  {['left', 'center', 'right'].map((pos) => (
                    <button
                      key={pos}
                      onClick={() => handleBrandingChange('logoPosition', pos)}
                      className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                        (localSettings.branding?.logoPosition || 'left') === pos
                          ? 'bg-pink-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      {pos === 'left' ? 'Po lewej' : pos === 'center' ? 'Na środku' : 'Po prawej'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Obrazek nagłówka */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Obrazek nagłówka
                </label>
                <input
                  ref={headerImageRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e.target.files[0], 'header')}
                  className="hidden"
                />
                {localSettings.branding?.headerImage ? (
                  <div className="relative">
                    <img
                      src={localSettings.branding.headerImage}
                      alt="Nagłówek"
                      className="w-full h-32 object-cover rounded-xl border border-gray-200 dark:border-gray-600"
                    />
                    <button
                      onClick={() => handleRemoveImage('header')}
                      className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => headerImageRef.current?.click()}
                    disabled={uploadingImage === 'header'}
                    className="w-full h-32 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-gray-600 dark:text-gray-400 hover:border-pink-500 hover:text-pink-500 transition-colors"
                  >
                    {uploadingImage === 'header' ? (
                      <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Upload size={24} />
                        <span className="text-sm">Dodaj obrazek nagłówka</span>
                      </>
                    )}
                  </button>
                )}
                <div className="mt-2">
                  <label className="text-xs text-gray-500 dark:text-gray-400">
                    Wysokość nagłówka: {localSettings.branding?.headerHeight || 200}px
                  </label>
                  <input
                    type="range"
                    min="100"
                    max="400"
                    value={localSettings.branding?.headerHeight || 200}
                    onChange={(e) => handleBrandingChange('headerHeight', parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                  />
                </div>
              </div>

              {/* Obrazek tła */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Obrazek tła
                </label>
                <input
                  ref={backgroundImageRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e.target.files[0], 'background')}
                  className="hidden"
                />
                {localSettings.branding?.backgroundImage ? (
                  <div className="relative">
                    <img
                      src={localSettings.branding.backgroundImage}
                      alt="Tło"
                      className="w-full h-32 object-cover rounded-xl border border-gray-200 dark:border-gray-600"
                    />
                    <button
                      onClick={() => handleRemoveImage('background')}
                      className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => backgroundImageRef.current?.click()}
                    disabled={uploadingImage === 'background'}
                    className="w-full h-32 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-gray-600 dark:text-gray-400 hover:border-pink-500 hover:text-pink-500 transition-colors"
                  >
                    {uploadingImage === 'background' ? (
                      <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Upload size={24} />
                        <span className="text-sm">Dodaj obrazek tła</span>
                      </>
                    )}
                  </button>
                )}
                {localSettings.branding?.backgroundImage && (
                  <div className="mt-2">
                    <label className="text-xs text-gray-500 dark:text-gray-400">
                      Przyciemnienie tła: {Math.round((localSettings.branding?.backgroundOverlay || 0.5) * 100)}%
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={(localSettings.branding?.backgroundOverlay || 0.5) * 100}
                      onChange={(e) => handleBrandingChange('backgroundOverlay', parseInt(e.target.value) / 100)}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sekcja cennika/płatności */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white mb-4">
              <DollarSign size={20} className="text-green-500" />
              Cennik i płatności
            </h2>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    Włącz cennik
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Pokaż podsumowanie ceny na formularzu
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localSettings.pricing?.enabled || false}
                    onChange={(e) => handlePricingChange('enabled', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-pink-300 dark:peer-focus:ring-pink-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-green-500"></div>
                </label>
              </div>

              {localSettings.pricing?.enabled && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Waluta
                    </label>
                    <select
                      value={localSettings.pricing?.currency || 'PLN'}
                      onChange={(e) => handlePricingChange('currency', e.target.value)}
                      className="w-full px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500"
                    >
                      <option value="PLN">PLN (zł)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="USD">USD ($)</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        Wymagana płatność
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Użytkownik musi zapłacić przed zapisem
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={localSettings.pricing?.paymentRequired || false}
                        onChange={(e) => handlePricingChange('paymentRequired', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-pink-300 dark:peer-focus:ring-pink-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-green-500"></div>
                    </label>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Metody płatności
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { id: 'transfer', label: 'Przelew bankowy', icon: CreditCard },
                        { id: 'cash', label: 'Gotówka', icon: DollarSign },
                        { id: 'paypal', label: 'PayPal', icon: CreditCard },
                        { id: 'przelewy24', label: 'Przelewy24', icon: CreditCard }
                      ].map((method) => {
                        const isSelected = (localSettings.pricing?.paymentMethods || []).includes(method.id);
                        return (
                          <button
                            key={method.id}
                            onClick={() => {
                              const current = localSettings.pricing?.paymentMethods || [];
                              const updated = isSelected
                                ? current.filter(m => m !== method.id)
                                : [...current, method.id];
                              handlePricingChange('paymentMethods', updated);
                            }}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-colors ${
                              isSelected
                                ? 'bg-green-50 dark:bg-green-900/30 border-green-500 text-green-700 dark:text-green-400'
                                : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                            }`}
                          >
                            <method.icon size={16} />
                            {method.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {(localSettings.pricing?.paymentMethods || []).includes('transfer') && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        Numer konta bankowego
                      </label>
                      <input
                        type="text"
                        value={localSettings.pricing?.bankAccount || ''}
                        onChange={(e) => handlePricingChange('bankAccount', e.target.value)}
                        placeholder="00 0000 0000 0000 0000 0000 0000"
                        className="w-full px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 font-mono"
                      />
                    </div>
                  )}

                  {(localSettings.pricing?.paymentMethods || []).includes('paypal') && (
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                      <h4 className="flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-400 mb-3">
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106zm14.146-14.42a3.35 3.35 0 0 0-.607-.541c1.582 3.185-.072 5.065-3.51 5.065h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106H7.076a.641.641 0 0 1-.633-.74l.142-.9h1.538c.524 0 .968-.382 1.05-.901l1.05-6.66h2.475c4.298 0 7.664-1.747 8.648-6.797.03-.149.054-.294.077-.437-.144-.095-.296-.187-.457-.275l.256.18z"/>
                        </svg>
                        Konfiguracja PayPal
                      </h4>

                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-blue-700 dark:text-blue-400 mb-1">
                            PayPal Client ID
                          </label>
                          <input
                            type="text"
                            value={localSettings.pricing?.paypal?.clientId || ''}
                            onChange={(e) => handlePricingChange('paypal', {
                              ...(localSettings.pricing?.paypal || {}),
                              clientId: e.target.value
                            })}
                            placeholder="Twój PayPal Client ID"
                            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-blue-200 dark:border-blue-700 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                          />
                          <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                            Znajdziesz go w{' '}
                            <a
                              href="https://developer.paypal.com/dashboard/applications"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline hover:text-blue-800 dark:hover:text-blue-300"
                            >
                              PayPal Developer Dashboard
                            </a>
                          </p>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-700/50 rounded-lg">
                          <div>
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              Tryb testowy (Sandbox)
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Użyj środowiska testowego PayPal
                            </p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={localSettings.pricing?.paypal?.sandbox !== false}
                              onChange={(e) => handlePricingChange('paypal', {
                                ...(localSettings.pricing?.paypal || {}),
                                sandbox: e.target.checked
                              })}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-500"></div>
                          </label>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-blue-700 dark:text-blue-400 mb-1">
                            Opis płatności
                          </label>
                          <input
                            type="text"
                            value={localSettings.pricing?.paypal?.description || ''}
                            onChange={(e) => handlePricingChange('paypal', {
                              ...(localSettings.pricing?.paypal || {}),
                              description: e.target.value
                            })}
                            placeholder="np. Opłata za wydarzenie"
                            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-blue-200 dark:border-blue-700 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {(localSettings.pricing?.paymentMethods || []).includes('przelewy24') && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
                      <h4 className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-400 mb-3">
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                        </svg>
                        Konfiguracja Przelewy24
                      </h4>

                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-red-700 dark:text-red-400 mb-1">
                            Merchant ID (POS ID)
                          </label>
                          <input
                            type="text"
                            value={localSettings.pricing?.przelewy24?.merchantId || ''}
                            onChange={(e) => handlePricingChange('przelewy24', {
                              ...(localSettings.pricing?.przelewy24 || {}),
                              merchantId: e.target.value
                            })}
                            placeholder="Twój Merchant ID"
                            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-red-200 dark:border-red-700 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-red-700 dark:text-red-400 mb-1">
                            CRC Key
                          </label>
                          <input
                            type="password"
                            value={localSettings.pricing?.przelewy24?.crcKey || ''}
                            onChange={(e) => handlePricingChange('przelewy24', {
                              ...(localSettings.pricing?.przelewy24 || {}),
                              crcKey: e.target.value
                            })}
                            placeholder="Klucz CRC"
                            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-red-200 dark:border-red-700 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-red-700 dark:text-red-400 mb-1">
                            API Key
                          </label>
                          <input
                            type="password"
                            value={localSettings.pricing?.przelewy24?.apiKey || ''}
                            onChange={(e) => handlePricingChange('przelewy24', {
                              ...(localSettings.pricing?.przelewy24 || {}),
                              apiKey: e.target.value
                            })}
                            placeholder="Klucz API"
                            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-red-200 dark:border-red-700 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                          />
                          <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                            Znajdziesz je w{' '}
                            <a
                              href="https://panel.przelewy24.pl"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline hover:text-red-800 dark:hover:text-red-300"
                            >
                              Panelu Przelewy24
                            </a>
                          </p>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-700/50 rounded-lg">
                          <div>
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              Tryb testowy (Sandbox)
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Użyj środowiska testowego P24
                            </p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={localSettings.pricing?.przelewy24?.sandbox !== false}
                              onChange={(e) => handlePricingChange('przelewy24', {
                                ...(localSettings.pricing?.przelewy24 || {}),
                                sandbox: e.target.checked
                              })}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 dark:peer-focus:ring-red-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-red-500"></div>
                          </label>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-red-700 dark:text-red-400 mb-1">
                            Opis płatności
                          </label>
                          <input
                            type="text"
                            value={localSettings.pricing?.przelewy24?.description || ''}
                            onChange={(e) => handlePricingChange('przelewy24', {
                              ...(localSettings.pricing?.przelewy24 || {}),
                              description: e.target.value
                            })}
                            placeholder="np. Opłata za wydarzenie"
                            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-red-200 dark:border-red-700 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Instrukcje płatności
                    </label>
                    <textarea
                      value={localSettings.pricing?.paymentInstructions || ''}
                      onChange={(e) => handlePricingChange('paymentInstructions', e.target.value)}
                      placeholder="Dodatkowe informacje dotyczące płatności..."
                      rows={3}
                      className="w-full px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 resize-none"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Sekcja powiadomien email */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white mb-4">
              <Mail size={20} className="text-blue-500" />
              Powiadomienia email
            </h2>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    Wlacz powiadomienia email
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Wysylaj automatyczne emaile do uzytkownikow i administratorow
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localSettings.emails?.enabled || false}
                    onChange={(e) => handleEmailsChange('enabled', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-500"></div>
                </label>
              </div>

              {localSettings.emails?.enabled && (
                <>
                  {/* Potwierdzenie rejestracji */}
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Bell size={18} className="text-green-600 dark:text-green-400" />
                        <h4 className="font-semibold text-green-700 dark:text-green-400">
                          Potwierdzenie rejestracji
                        </h4>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={localSettings.emails?.confirmationEmail?.enabled !== false}
                          onChange={(e) => handleEmailTypeChange('confirmationEmail', 'enabled', e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-500"></div>
                      </label>
                    </div>
                    <p className="text-sm text-green-600 dark:text-green-400 mb-3">
                      Wysylany automatycznie po wyslaniu formularza
                    </p>

                    {localSettings.emails?.confirmationEmail?.enabled !== false && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="confirmation-custom"
                            checked={localSettings.emails?.confirmationEmail?.useCustomTemplate || false}
                            onChange={(e) => handleEmailTypeChange('confirmationEmail', 'useCustomTemplate', e.target.checked)}
                            className="w-4 h-4 text-green-600 bg-white border-gray-300 rounded focus:ring-green-500"
                          />
                          <label htmlFor="confirmation-custom" className="text-sm text-gray-700 dark:text-gray-300">
                            Uzyj wlasnego szablonu
                          </label>
                        </div>

                        {localSettings.emails?.confirmationEmail?.useCustomTemplate && (
                          <div className="space-y-2">
                            <div>
                              <label className="block text-xs font-medium text-green-700 dark:text-green-400 mb-1">
                                Temat emaila
                              </label>
                              <input
                                type="text"
                                value={localSettings.emails?.confirmationEmail?.customSubject || DEFAULT_FORM_EMAIL_TEMPLATES.confirmation.subject}
                                onChange={(e) => handleEmailTypeChange('confirmationEmail', 'customSubject', e.target.value)}
                                placeholder="Potwierdzenie - {{formularz_nazwa}}"
                                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-green-200 dark:border-green-700 rounded-lg text-sm"
                              />
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setEditingTemplate({ type: 'confirmationEmail', template: DEFAULT_FORM_EMAIL_TEMPLATES.confirmation })}
                                className="flex items-center gap-1 px-3 py-1.5 bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-300 rounded-lg text-sm hover:bg-green-200 dark:hover:bg-green-700"
                              >
                                <Edit3 size={14} />
                                Edytuj szablon
                              </button>
                              <button
                                onClick={() => setPreviewTemplate(DEFAULT_FORM_EMAIL_TEMPLATES.confirmation)}
                                className="flex items-center gap-1 px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600"
                              >
                                <Eye size={14} />
                                Podglad
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Informacja o platnosci */}
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <DollarSign size={18} className="text-emerald-600 dark:text-emerald-400" />
                        <h4 className="font-semibold text-emerald-700 dark:text-emerald-400">
                          Informacja o platnosci
                        </h4>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={localSettings.emails?.paymentEmail?.enabled !== false}
                          onChange={(e) => handleEmailTypeChange('paymentEmail', 'enabled', e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                      </label>
                    </div>
                    <p className="text-sm text-emerald-600 dark:text-emerald-400 mb-3">
                      Wysylany gdy wymagana jest platnosc przelewem
                    </p>

                    {localSettings.emails?.paymentEmail?.enabled !== false && (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-emerald-700 dark:text-emerald-400 mb-1">
                            Termin platnosci (dni)
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="30"
                            value={localSettings.emails?.paymentDeadlineDays || 7}
                            onChange={(e) => handleEmailsChange('paymentDeadlineDays', parseInt(e.target.value) || 7)}
                            className="w-24 px-3 py-2 bg-white dark:bg-gray-700 border border-emerald-200 dark:border-emerald-700 rounded-lg text-sm"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="payment-custom"
                            checked={localSettings.emails?.paymentEmail?.useCustomTemplate || false}
                            onChange={(e) => handleEmailTypeChange('paymentEmail', 'useCustomTemplate', e.target.checked)}
                            className="w-4 h-4 text-emerald-600 bg-white border-gray-300 rounded focus:ring-emerald-500"
                          />
                          <label htmlFor="payment-custom" className="text-sm text-gray-700 dark:text-gray-300">
                            Uzyj wlasnego szablonu
                          </label>
                        </div>

                        {localSettings.emails?.paymentEmail?.useCustomTemplate && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => setEditingTemplate({ type: 'paymentEmail', template: DEFAULT_FORM_EMAIL_TEMPLATES.payment_info })}
                              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-100 dark:bg-emerald-800 text-emerald-700 dark:text-emerald-300 rounded-lg text-sm hover:bg-emerald-200 dark:hover:bg-emerald-700"
                            >
                              <Edit3 size={14} />
                              Edytuj szablon
                            </button>
                            <button
                              onClick={() => setPreviewTemplate(DEFAULT_FORM_EMAIL_TEMPLATES.payment_info)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600"
                            >
                              <Eye size={14} />
                              Podglad
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Przypomnienie o platnosci */}
                  <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Clock size={18} className="text-amber-600 dark:text-amber-400" />
                        <h4 className="font-semibold text-amber-700 dark:text-amber-400">
                          Przypomnienie o platnosci
                        </h4>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={localSettings.emails?.reminderEmail?.enabled || false}
                          onChange={(e) => handleEmailTypeChange('reminderEmail', 'enabled', e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                      </label>
                    </div>
                    <p className="text-sm text-amber-600 dark:text-amber-400 mb-3">
                      Wysylany jako przypomnienie przed uplywem terminu platnosci
                    </p>

                    {localSettings.emails?.reminderEmail?.enabled && (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">
                            Wyslij przypomnienie na ile dni przed terminem
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="14"
                            value={localSettings.emails?.reminderEmail?.daysBeforeDeadline || 3}
                            onChange={(e) => handleEmailTypeChange('reminderEmail', 'daysBeforeDeadline', parseInt(e.target.value) || 3)}
                            className="w-24 px-3 py-2 bg-white dark:bg-gray-700 border border-amber-200 dark:border-amber-700 rounded-lg text-sm"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="reminder-custom"
                            checked={localSettings.emails?.reminderEmail?.useCustomTemplate || false}
                            onChange={(e) => handleEmailTypeChange('reminderEmail', 'useCustomTemplate', e.target.checked)}
                            className="w-4 h-4 text-amber-600 bg-white border-gray-300 rounded focus:ring-amber-500"
                          />
                          <label htmlFor="reminder-custom" className="text-sm text-gray-700 dark:text-gray-300">
                            Uzyj wlasnego szablonu
                          </label>
                        </div>

                        {localSettings.emails?.reminderEmail?.useCustomTemplate && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => setEditingTemplate({ type: 'reminderEmail', template: DEFAULT_FORM_EMAIL_TEMPLATES.payment_reminder })}
                              className="flex items-center gap-1 px-3 py-1.5 bg-amber-100 dark:bg-amber-800 text-amber-700 dark:text-amber-300 rounded-lg text-sm hover:bg-amber-200 dark:hover:bg-amber-700"
                            >
                              <Edit3 size={14} />
                              Edytuj szablon
                            </button>
                            <button
                              onClick={() => setPreviewTemplate(DEFAULT_FORM_EMAIL_TEMPLATES.payment_reminder)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600"
                            >
                              <Eye size={14} />
                              Podglad
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Potwierdzenie platnosci */}
                  <div className="p-4 bg-teal-50 dark:bg-teal-900/20 rounded-xl border border-teal-200 dark:border-teal-800">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <CreditCard size={18} className="text-teal-600 dark:text-teal-400" />
                        <h4 className="font-semibold text-teal-700 dark:text-teal-400">
                          Potwierdzenie platnosci
                        </h4>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={localSettings.emails?.paymentConfirmedEmail?.enabled !== false}
                          onChange={(e) => handleEmailTypeChange('paymentConfirmedEmail', 'enabled', e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-teal-500"></div>
                      </label>
                    </div>
                    <p className="text-sm text-teal-600 dark:text-teal-400 mb-3">
                      Wysylany po potwierdzeniu otrzymania platnosci
                    </p>

                    {localSettings.emails?.paymentConfirmedEmail?.enabled !== false && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="confirmed-custom"
                            checked={localSettings.emails?.paymentConfirmedEmail?.useCustomTemplate || false}
                            onChange={(e) => handleEmailTypeChange('paymentConfirmedEmail', 'useCustomTemplate', e.target.checked)}
                            className="w-4 h-4 text-teal-600 bg-white border-gray-300 rounded focus:ring-teal-500"
                          />
                          <label htmlFor="confirmed-custom" className="text-sm text-gray-700 dark:text-gray-300">
                            Uzyj wlasnego szablonu
                          </label>
                        </div>

                        {localSettings.emails?.paymentConfirmedEmail?.useCustomTemplate && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => setEditingTemplate({ type: 'paymentConfirmedEmail', template: DEFAULT_FORM_EMAIL_TEMPLATES.payment_confirmed })}
                              className="flex items-center gap-1 px-3 py-1.5 bg-teal-100 dark:bg-teal-800 text-teal-700 dark:text-teal-300 rounded-lg text-sm hover:bg-teal-200 dark:hover:bg-teal-700"
                            >
                              <Edit3 size={14} />
                              Edytuj szablon
                            </button>
                            <button
                              onClick={() => setPreviewTemplate(DEFAULT_FORM_EMAIL_TEMPLATES.payment_confirmed)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600"
                            >
                              <Eye size={14} />
                              Podglad
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Powiadomienie dla administratora */}
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <AlertCircle size={18} className="text-blue-600 dark:text-blue-400" />
                        <h4 className="font-semibold text-blue-700 dark:text-blue-400">
                          Powiadomienie dla administratora
                        </h4>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={localSettings.emails?.adminNotification?.enabled || false}
                          onChange={(e) => handleEmailTypeChange('adminNotification', 'enabled', e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
                      </label>
                    </div>
                    <p className="text-sm text-blue-600 dark:text-blue-400 mb-3">
                      Wysylany do administratorow po kazdym nowym zgloszeniu
                    </p>

                    {localSettings.emails?.adminNotification?.enabled && (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-blue-700 dark:text-blue-400 mb-1">
                            Adresy email administratorow (po przecinku)
                          </label>
                          <input
                            type="text"
                            value={(localSettings.emails?.adminNotification?.emails || []).join(', ')}
                            onChange={(e) => {
                              const emails = e.target.value.split(',').map(e => e.trim()).filter(e => e);
                              handleEmailTypeChange('adminNotification', 'emails', emails);
                            }}
                            placeholder="admin@example.com, manager@example.com"
                            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-blue-200 dark:border-blue-700 rounded-lg text-sm"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="admin-custom"
                            checked={localSettings.emails?.adminNotification?.useCustomTemplate || false}
                            onChange={(e) => handleEmailTypeChange('adminNotification', 'useCustomTemplate', e.target.checked)}
                            className="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500"
                          />
                          <label htmlFor="admin-custom" className="text-sm text-gray-700 dark:text-gray-300">
                            Uzyj wlasnego szablonu
                          </label>
                        </div>

                        {localSettings.emails?.adminNotification?.useCustomTemplate && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => setEditingTemplate({ type: 'adminNotification', template: DEFAULT_FORM_EMAIL_TEMPLATES.admin_notification })}
                              className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300 rounded-lg text-sm hover:bg-blue-200 dark:hover:bg-blue-700"
                            >
                              <Edit3 size={14} />
                              Edytuj szablon
                            </button>
                            <button
                              onClick={() => setPreviewTemplate(DEFAULT_FORM_EMAIL_TEMPLATES.admin_notification)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600"
                            >
                              <Eye size={14} />
                              Podglad
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Info o zmiennych */}
                  <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Dostepne zmienne w szablonach:
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {['{{imie}}', '{{nazwisko}}', '{{email}}', '{{formularz_nazwa}}', '{{kwota}}', '{{numer_konta}}', '{{termin_platnosci}}', '{{odpowiedzi}}'].map((variable) => (
                        <code
                          key={variable}
                          className="px-2 py-1 bg-white dark:bg-gray-600 text-xs text-gray-600 dark:text-gray-300 rounded border border-gray-200 dark:border-gray-500"
                        >
                          {variable}
                        </code>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal podgladu szablonu */}
      {previewTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Podglad: {previewTemplate.name}
              </h3>
              <button
                onClick={() => setPreviewTemplate(null)}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 overflow-auto max-h-[calc(90vh-80px)]">
              <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  <strong>Temat:</strong> {previewTemplate.subject}
                </p>
              </div>
              <div
                className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden"
                dangerouslySetInnerHTML={{ __html: previewTemplate.html_content }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal edycji szablonu */}
      {editingTemplate && (
        <div className="fixed inset-0 z-50 flex flex-col bg-gray-100 dark:bg-gray-900">
          {/* Nagłówek modala */}
          <div className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setEditingTemplate(null);
                    setEditorMode('visual');
                  }}
                  className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  <ChevronLeft size={20} />
                </button>
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Edytuj szablon: {editingTemplate.template.name}
                </h3>
              </div>

              <div className="flex items-center gap-3">
                {/* Przełącznik trybu edycji */}
                <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                  <button
                    onClick={() => setEditorMode('visual')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      editorMode === 'visual'
                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    <Palette size={16} />
                    Kreator
                  </button>
                  <button
                    onClick={() => setEditorMode('code')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      editorMode === 'code'
                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    <Code size={16} />
                    Kod HTML
                  </button>
                </div>

                <button
                  onClick={() => {
                    handleEmailTypeChange(editingTemplate.type, 'customHtml',
                      localSettings.emails?.[editingTemplate.type]?.customHtml || editingTemplate.template.html_content
                    );
                    setEditingTemplate(null);
                    setEditorMode('visual');
                  }}
                  className="px-4 py-2 bg-gradient-to-r from-pink-500 to-orange-500 text-white rounded-lg text-sm font-medium hover:shadow-lg hover:shadow-pink-500/25 transition-all"
                >
                  Zapisz i zamknij
                </button>
              </div>
            </div>
          </div>

          {/* Temat emaila */}
          <div className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                Temat emaila:
              </label>
              <input
                type="text"
                value={localSettings.emails?.[editingTemplate.type]?.customSubject || editingTemplate.template.subject}
                onChange={(e) => handleEmailTypeChange(editingTemplate.type, 'customSubject', e.target.value)}
                className="flex-1 px-4 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white"
                placeholder="Temat emaila..."
              />
            </div>
          </div>

          {/* Edytor */}
          <div className="flex-1 overflow-hidden">
            {editorMode === 'visual' ? (
              <DragDropEmailBuilder
                content={localSettings.emails?.[editingTemplate.type]?.customHtml || editingTemplate.template.html_content}
                jsonBlocks={localSettings.emails?.[editingTemplate.type]?.customBlocks || null}
                onChange={(html) => handleEmailTypeChange(editingTemplate.type, 'customHtml', html)}
                onBlocksChange={(blocks) => handleEmailTypeChange(editingTemplate.type, 'customBlocks', blocks)}
              />
            ) : (
              <div className="h-full flex flex-col p-4">
                {/* Zmienne info */}
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-400 mb-2">
                    Dostępne zmienne (kliknij aby wstawić):
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {FORM_EMAIL_VARIABLES.map((variable) => (
                      <button
                        key={variable.key}
                        onClick={() => {
                          const currentHtml = localSettings.emails?.[editingTemplate.type]?.customHtml || editingTemplate.template.html_content;
                          handleEmailTypeChange(editingTemplate.type, 'customHtml', currentHtml + variable.key);
                        }}
                        className="px-2 py-1 bg-white dark:bg-gray-700 text-xs text-gray-700 dark:text-gray-300 rounded border border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-800 transition-colors"
                        title={variable.description}
                      >
                        {variable.key}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Textarea z kodem HTML */}
                <div className="flex-1 min-h-0">
                  <textarea
                    value={localSettings.emails?.[editingTemplate.type]?.customHtml || editingTemplate.template.html_content}
                    onChange={(e) => handleEmailTypeChange(editingTemplate.type, 'customHtml', e.target.value)}
                    className="w-full h-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg font-mono text-sm text-gray-900 dark:text-white resize-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500"
                    placeholder="Wprowadź kod HTML szablonu..."
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
