import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { createTrialSubscription } from '../../lib/subscriptions';
import {
  Church,
  Mail,
  Lock,
  User,
  Building,
  Phone,
  ArrowRight,
  Loader2,
  Check,
  AlertCircle
} from 'lucide-react';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [formData, setFormData] = useState({
    // Step 1 - User account
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',

    // Step 2 - Church info
    churchName: '',
    churchSlug: '',
    companyName: '',
    taxId: '',
    phone: '',
    address: '',
    city: '',
    postalCode: ''
  });

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));

    // Auto-generate slug from church name
    if (field === 'churchName') {
      const slug = value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      setFormData(prev => ({ ...prev, churchSlug: slug }));
    }
  };

  const validateStep1 = () => {
    if (!formData.email || !formData.password || !formData.fullName) {
      setError('Wypełnij wszystkie wymagane pola');
      return false;
    }
    if (formData.password.length < 8) {
      setError('Hasło musi mieć minimum 8 znaków');
      return false;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Hasła nie są identyczne');
      return false;
    }
    setError(null);
    return true;
  };

  const validateStep2 = () => {
    if (!formData.churchName || !formData.churchSlug) {
      setError('Podaj nazwę kościoła');
      return false;
    }
    if (formData.churchSlug.length < 3) {
      setError('Slug musi mieć minimum 3 znaki');
      return false;
    }
    setError(null);
    return true;
  };

  const handleNextStep = () => {
    if (step === 1 && validateStep1()) {
      setStep(2);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();

    if (!validateStep2()) return;

    setLoading(true);
    setError(null);

    try {
      // 1. Create user account
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName
          }
        }
      });

      if (authError) throw authError;

      // 2. Create tenant
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .insert({
          name: formData.churchName,
          slug: formData.churchSlug,
          email: formData.email,
          company_name: formData.companyName || null,
          tax_id: formData.taxId || null,
          phone: formData.phone || null,
          address: formData.address || null,
          city: formData.city || null,
          postal_code: formData.postalCode || null,
          status: 'trial',
          trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
        })
        .select()
        .single();

      if (tenantError) throw tenantError;

      // 3. Update user with tenant_id
      const { error: userUpdateError } = await supabase
        .from('app_users')
        .update({
          tenant_id: tenant.id,
          tenant_role: 'admin',
          full_name: formData.fullName
        })
        .eq('id', authData.user.id);

      if (userUpdateError) {
        console.warn('User update error (may be created by trigger):', userUpdateError);
      }

      // 4. Create trial subscription
      await createTrialSubscription(tenant.id, 'starter');

      // 5. Redirect to app
      navigate('/app', { replace: true });

    } catch (err) {
      console.error('Registration error:', err);
      setError(err.message || 'Wystąpił błąd podczas rejestracji');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
      {/* Left side - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 mb-8">
            <Church size={32} className="text-accent-primary" />
            <span className="text-2xl font-bold text-gray-900 dark:text-white">
              AppSchtomy
            </span>
          </Link>

          {/* Progress */}
          <div className="flex items-center gap-4 mb-8">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step >= 1 ? 'bg-accent-primary text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
              }`}>
                {step > 1 ? <Check size={16} /> : '1'}
              </div>
              <span className="text-sm text-gray-600 dark:text-gray-400">Konto</span>
            </div>
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step >= 2 ? 'bg-accent-primary text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
              }`}>
                2
              </div>
              <span className="text-sm text-gray-600 dark:text-gray-400">Kościół</span>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={step === 2 ? handleRegister : (e) => { e.preventDefault(); handleNextStep(); }}>
            {step === 1 ? (
              <>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Utwórz konto
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Zacznij od 14-dniowego darmowego okresu próbnego
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Imię i nazwisko *
                    </label>
                    <div className="relative">
                      <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={formData.fullName}
                        onChange={(e) => updateField('fullName', e.target.value)}
                        placeholder="Jan Kowalski"
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary-light focus:border-transparent"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Email *
                    </label>
                    <div className="relative">
                      <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => updateField('email', e.target.value)}
                        placeholder="jan@kosciol.pl"
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary-light focus:border-transparent"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Hasło *
                    </label>
                    <div className="relative">
                      <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="password"
                        value={formData.password}
                        onChange={(e) => updateField('password', e.target.value)}
                        placeholder="Minimum 8 znaków"
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary-light focus:border-transparent"
                        required
                        minLength={8}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Powtórz hasło *
                    </label>
                    <div className="relative">
                      <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="password"
                        value={formData.confirmPassword}
                        onChange={(e) => updateField('confirmPassword', e.target.value)}
                        placeholder="Powtórz hasło"
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary-light focus:border-transparent"
                        required
                      />
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Informacje o kościele
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Podaj podstawowe dane swojego kościoła
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Nazwa kościoła *
                    </label>
                    <div className="relative">
                      <Building size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={formData.churchName}
                        onChange={(e) => updateField('churchName', e.target.value)}
                        placeholder="Kościół Łaski"
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary-light focus:border-transparent"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      URL kościoła *
                    </label>
                    <div className="flex items-center">
                      <span className="px-3 py-3 bg-gray-100 dark:bg-gray-700 border border-r-0 border-gray-200 dark:border-gray-700 rounded-l-xl text-gray-500 text-sm">
                        app.appschtomy.pl/
                      </span>
                      <input
                        type="text"
                        value={formData.churchSlug}
                        onChange={(e) => updateField('churchSlug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                        placeholder="kosciol-laski"
                        className="flex-1 px-4 py-3 rounded-r-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary-light focus:border-transparent"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        NIP (opcjonalnie)
                      </label>
                      <input
                        type="text"
                        value={formData.taxId}
                        onChange={(e) => updateField('taxId', e.target.value)}
                        placeholder="1234567890"
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary-light focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Telefon (opcjonalnie)
                      </label>
                      <div className="relative">
                        <Phone size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="tel"
                          value={formData.phone}
                          onChange={(e) => updateField('phone', e.target.value)}
                          placeholder="+48 123 456 789"
                          className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary-light focus:border-transparent"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Miasto (opcjonalnie)
                    </label>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => updateField('city', e.target.value)}
                      placeholder="Warszawa"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary-light focus:border-transparent"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Error message */}
            {error && (
              <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg flex items-center gap-2 text-sm">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            {/* Buttons */}
            <div className="mt-6 flex gap-3">
              {step === 2 && (
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-6 py-3 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition"
                >
                  Wstecz
                </button>
              )}
              <button
                type="submit"
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-xl font-semibold hover:shadow-lg transition disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Tworzenie konta...
                  </>
                ) : step === 1 ? (
                  <>
                    Dalej
                    <ArrowRight size={18} />
                  </>
                ) : (
                  <>
                    Utwórz konto
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </div>

            {/* Terms */}
            <p className="mt-4 text-xs text-gray-500 dark:text-gray-500 text-center">
              Rejestrując się, akceptujesz{' '}
              <a href="#" className="text-accent-primary hover:underline">Regulamin</a>
              {' '}oraz{' '}
              <a href="#" className="text-accent-primary hover:underline">Politykę prywatności</a>
            </p>
          </form>

          {/* Login link */}
          <p className="mt-8 text-center text-gray-600 dark:text-gray-400">
            Masz już konto?{' '}
            <Link to="/login" className="text-accent-primary hover:underline font-medium">
              Zaloguj się
            </Link>
          </p>
        </div>
      </div>

      {/* Right side - Image/Info */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-accent-primary to-accent-secondary items-center justify-center p-12">
        <div className="max-w-md text-white">
          <h2 className="text-3xl font-bold mb-4">
            Dołącz do społeczności AppSchtomy
          </h2>
          <p className="text-white/80 mb-8">
            Ponad 500 kościołów już korzysta z naszej platformy do zarządzania
            członkami, wydarzeniami i check-inem dzieci.
          </p>
          <ul className="space-y-4">
            {[
              '14 dni za darmo, bez karty kredytowej',
              'Pełna funkcjonalność od pierwszego dnia',
              'Wsparcie techniczne 24/7',
              'Bezpieczne przechowywanie danych (RODO)'
            ].map((item, i) => (
              <li key={i} className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                  <Check size={14} />
                </div>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
