import { useState, useRef } from 'react';
import { Upload, X, File, MapPin, Calendar, Clock, DollarSign, Users, ImageIcon, Trash2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatPrice } from '../utils/fieldTypes';

export default function FieldRenderer({
  field,
  value,
  onChange,
  error,
  disabled = false
}) {
  const [uploadProgress, setUploadProgress] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileUpload = async (files) => {
    if (!files || files.length === 0) return;

    const maxSize = (field.fileConfig?.maxSize || 10) * 1024 * 1024;
    const multiple = field.fileConfig?.multiple || false;

    const filesToUpload = multiple ? Array.from(files) : [files[0]];

    for (const file of filesToUpload) {
      if (file.size > maxSize) {
        alert(`Plik "${file.name}" przekracza maksymalny rozmiar ${field.fileConfig?.maxSize || 10} MB`);
        return;
      }
    }

    setUploadProgress(0);

    try {
      const uploadedFiles = [];

      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${file.name}`;
        const filePath = `form-responses/${fileName}`;

        const { data, error: uploadError } = await supabase.storage
          .from('form-uploads')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('form-uploads')
          .getPublicUrl(filePath);

        uploadedFiles.push({
          name: file.name,
          size: file.size,
          type: file.type,
          path: filePath,
          url: urlData.publicUrl
        });

        setUploadProgress(Math.round(((i + 1) / filesToUpload.length) * 100));
      }

      if (multiple) {
        onChange([...(value || []), ...uploadedFiles]);
      } else {
        onChange(uploadedFiles[0]);
      }
    } catch (err) {
      console.error('Upload error:', err);
      alert('Błąd podczas przesyłania pliku');
    } finally {
      setUploadProgress(null);
    }
  };

  const handleRemoveFile = (fileToRemove) => {
    if (Array.isArray(value)) {
      onChange(value.filter(f => f.path !== fileToRemove.path));
    } else {
      onChange(null);
    }
  };

  const baseInputClass = `w-full px-4 py-3 bg-white dark:bg-gray-800 border rounded-xl text-gray-900 dark:text-white
    focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500
    disabled:opacity-50 disabled:cursor-not-allowed
    ${error ? 'border-red-500' : 'border-gray-200 dark:border-gray-700'}`;

  switch (field.type) {
    case 'text':
    case 'email':
    case 'phone':
      return (
        <input
          type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={disabled}
          className={baseInputClass}
          maxLength={field.validation?.maxLength}
        />
      );

    case 'number':
      return (
        <input
          type="number"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value ? parseFloat(e.target.value) : null)}
          placeholder={field.placeholder}
          disabled={disabled}
          className={baseInputClass}
          min={field.validation?.min}
          max={field.validation?.max}
        />
      );

    case 'textarea':
      return (
        <textarea
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={disabled}
          rows={4}
          className={`${baseInputClass} resize-none`}
          maxLength={field.validation?.maxLength}
        />
      );

    case 'select':
      return (
        <select
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={baseInputClass}
        >
          <option value="">{field.placeholder || 'Wybierz...'}</option>
          {(field.options || []).map((opt) => (
            <option key={opt.id} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );

    case 'radio':
      return (
        <div className="space-y-2">
          {(field.options || []).map((opt) => (
            <label
              key={opt.id}
              className={`flex items-center gap-3 p-3 bg-white dark:bg-gray-800 border rounded-xl cursor-pointer transition-all
                ${value === opt.value
                  ? 'border-pink-500 ring-2 ring-pink-500/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-pink-300 dark:hover:border-pink-600'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <input
                type="radio"
                name={field.id}
                value={opt.value}
                checked={value === opt.value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                className="w-4 h-4 text-pink-500 focus:ring-pink-500"
              />
              <span className="text-gray-900 dark:text-white">{opt.label}</span>
            </label>
          ))}
        </div>
      );

    case 'checkbox':
      const selectedValues = Array.isArray(value) ? value : [];
      return (
        <div className="space-y-2">
          {(field.options || []).map((opt) => (
            <label
              key={opt.id}
              className={`flex items-center gap-3 p-3 bg-white dark:bg-gray-800 border rounded-xl cursor-pointer transition-all
                ${selectedValues.includes(opt.value)
                  ? 'border-pink-500 ring-2 ring-pink-500/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-pink-300 dark:hover:border-pink-600'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <input
                type="checkbox"
                value={opt.value}
                checked={selectedValues.includes(opt.value)}
                onChange={(e) => {
                  if (e.target.checked) {
                    onChange([...selectedValues, opt.value]);
                  } else {
                    onChange(selectedValues.filter(v => v !== opt.value));
                  }
                }}
                disabled={disabled}
                className="w-4 h-4 rounded text-pink-500 focus:ring-pink-500"
              />
              <span className="text-gray-900 dark:text-white">{opt.label}</span>
            </label>
          ))}
        </div>
      );

    case 'date':
      return (
        <input
          type="date"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={baseInputClass}
        />
      );

    // === POLA WYDARZENIOWE ===
    case 'location':
      return (
        <div className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
            <MapPin size={18} />
          </div>
          <input
            type="text"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder || 'Wprowadź lokalizację...'}
            disabled={disabled}
            className={`${baseInputClass} pl-11`}
            maxLength={field.validation?.maxLength}
          />
        </div>
      );

    case 'date_start':
    case 'date_end':
      return (
        <div className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
            <Calendar size={18} />
          </div>
          <input
            type="date"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={`${baseInputClass} pl-11`}
          />
        </div>
      );

    case 'time_start':
    case 'time_end':
      return (
        <div className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
            <Clock size={18} />
          </div>
          <input
            type="time"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={`${baseInputClass} pl-11`}
          />
        </div>
      );

    case 'price':
      const priceConfig = field.priceConfig || {};
      const displayPrice = priceConfig.basePrice || 0;

      return (
        <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl border border-green-200 dark:border-green-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center">
              <DollarSign size={20} className="text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{field.label}</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {formatPrice(displayPrice, priceConfig.currency || 'PLN')}
              </p>
              {priceConfig.pricingType === 'per_person' && (
                <p className="text-xs text-gray-500">za osobę</p>
              )}
            </div>
          </div>
        </div>
      );

    case 'seat_limit':
      const seatConfig = field.seatConfig || {};
      const maxSeats = seatConfig.maxSeats;
      // remaining będzie przekazywane przez props w przyszłości

      return (
        <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center">
              <Users size={20} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{field.label}</p>
              {maxSeats ? (
                <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                  {maxSeats} miejsc
                </p>
              ) : (
                <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                  Bez limitu
                </p>
              )}
            </div>
          </div>
        </div>
      );

    case 'quantity':
      return (
        <div className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
            <Users size={18} />
          </div>
          <input
            type="number"
            value={value ?? (field.quantityConfig?.defaultValue || 1)}
            onChange={(e) => onChange(Math.max(1, parseInt(e.target.value) || 1))}
            placeholder={field.placeholder}
            disabled={disabled}
            min={field.validation?.min || 1}
            max={field.validation?.max || 99}
            className={`${baseInputClass} pl-11`}
          />
          {field.quantityConfig?.affectsPrice && (
            <p className="text-xs text-gray-500 mt-1">
              Liczba osób wpływa na całkowitą cenę
            </p>
          )}
        </div>
      );

    case 'file':
      const files = Array.isArray(value) ? value : (value ? [value] : []);
      const multiple = field.fileConfig?.multiple || false;

      return (
        <div className="space-y-3">
          {files.length > 0 && (
            <div className="space-y-2">
              {files.map((file, idx) => (
                <div
                  key={file.path || idx}
                  className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl"
                >
                  <File size={20} className="text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {file.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  {!disabled && (
                    <button
                      onClick={() => handleRemoveFile(file)}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <X size={18} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {(multiple || files.length === 0) && !disabled && (
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors
                ${error ? 'border-red-500' : 'border-gray-300 dark:border-gray-600 hover:border-pink-500'}`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple={multiple}
                onChange={(e) => handleFileUpload(e.target.files)}
                className="hidden"
                accept={field.fileConfig?.allowedTypes?.join(',')}
              />
              <Upload size={24} className="mx-auto text-gray-400 mb-2" />
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Kliknij lub przeciągnij plik
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Max. {field.fileConfig?.maxSize || 10} MB
              </p>

              {uploadProgress !== null && (
                <div className="absolute inset-0 bg-white/90 dark:bg-gray-800/90 rounded-xl flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-full border-4 border-pink-200 border-t-pink-500 animate-spin mx-auto mb-2"></div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Przesyłanie... {uploadProgress}%
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      );

    case 'image':
      const imageConfig = field.imageConfig || {};
      const images = Array.isArray(value) ? value : (value ? [value] : []);
      const multipleImages = imageConfig.multiple || false;

      const handleImageUpload = async (fileList) => {
        if (!fileList || fileList.length === 0) return;

        const maxSize = (imageConfig.maxSize || 5) * 1024 * 1024;
        const filesToUpload = multipleImages ? Array.from(fileList) : [fileList[0]];

        for (const file of filesToUpload) {
          if (file.size > maxSize) {
            alert(`Plik "${file.name}" przekracza maksymalny rozmiar ${imageConfig.maxSize || 5} MB`);
            return;
          }
          if (!file.type.startsWith('image/')) {
            alert(`Plik "${file.name}" nie jest obrazem`);
            return;
          }
        }

        setUploadProgress(0);

        try {
          const uploadedImages = [];

          for (let i = 0; i < filesToUpload.length; i++) {
            const file = filesToUpload[i];
            const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${file.name}`;
            const filePath = `form-images/${fileName}`;

            const { error: uploadError } = await supabase.storage
              .from('form-uploads')
              .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage
              .from('form-uploads')
              .getPublicUrl(filePath);

            uploadedImages.push({
              name: file.name,
              size: file.size,
              type: file.type,
              path: filePath,
              url: urlData.publicUrl
            });

            setUploadProgress(Math.round(((i + 1) / filesToUpload.length) * 100));
          }

          if (multipleImages) {
            onChange([...(value || []), ...uploadedImages]);
          } else {
            onChange(uploadedImages[0]);
          }
        } catch (err) {
          console.error('Image upload error:', err);
          alert('Błąd podczas przesyłania obrazu');
        } finally {
          setUploadProgress(null);
        }
      };

      const handleRemoveImage = (imageToRemove) => {
        if (Array.isArray(value)) {
          onChange(value.filter(img => img.path !== imageToRemove.path));
        } else {
          onChange(null);
        }
      };

      return (
        <div className="space-y-3">
          {/* Podgląd przesłanych obrazów */}
          {images.length > 0 && imageConfig.showPreview !== false && (
            <div className={`grid gap-3 ${multipleImages ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1'}`}>
              {images.map((img, idx) => (
                <div key={img.path || idx} className="relative group">
                  <img
                    src={img.url}
                    alt={img.name}
                    className="w-full h-32 object-cover rounded-xl border border-gray-200 dark:border-gray-700"
                  />
                  {!disabled && (
                    <button
                      onClick={() => handleRemoveImage(img)}
                      className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  <p className="text-xs text-gray-500 mt-1 truncate">{img.name}</p>
                </div>
              ))}
            </div>
          )}

          {/* Upload area */}
          {(multipleImages || images.length === 0) && !disabled && (
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
                ${error ? 'border-red-500' : 'border-gray-300 dark:border-gray-600 hover:border-pink-500'}`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple={multipleImages}
                onChange={(e) => handleImageUpload(e.target.files)}
                className="hidden"
                accept={imageConfig.allowedTypes?.join(',') || 'image/*'}
              />
              <div className="w-16 h-16 bg-gradient-to-br from-pink-50 to-orange-50 dark:from-pink-900/30 dark:to-orange-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
                <ImageIcon size={28} className="text-pink-500" />
              </div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Kliknij, aby dodać {multipleImages ? 'zdjęcia' : 'zdjęcie'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Max. {imageConfig.maxSize || 5} MB • JPG, PNG, WEBP, GIF
              </p>

              {uploadProgress !== null && (
                <div className="absolute inset-0 bg-white/90 dark:bg-gray-800/90 rounded-xl flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-full border-4 border-pink-200 border-t-pink-500 animate-spin mx-auto mb-2"></div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Przesyłanie... {uploadProgress}%
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      );

    default:
      return null;
  }
}
