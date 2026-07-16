import React, { useEffect, useState } from 'react';
import { usePlans } from '../hooks/usePlans';
import { formatPrice } from '../../../lib/subscriptions';
import {
  Package,
  Plus,
  Edit,
  Trash2,
  Check,
  X,
  Loader2,
  Save
} from 'lucide-react';
import { tr } from '../../../i18n';

export default function PlansManager() {
  const { getPlans, createPlan, updatePlan, deactivatePlan, loading } = usePlans();
  const [plans, setPlans] = useState([]);
  const [editingPlan, setEditingPlan] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    price_monthly: 0,
    price_yearly: 0,
    max_members: -1,
    max_users: -1,
    max_groups: -1,
    max_kids: -1,
    max_events: -1,
    max_storage_mb: 100,
    trial_days: 14,
    features: {},
    is_active: true,
    is_public: true,
    sort_order: 0
  });

  const featuresList = [
    { key: 'calendar', label: tr('Kalendarz') },
    { key: 'members', label: tr('Zarządzanie członkami') },
    { key: 'groups', label: tr('Grupy domowe') },
    { key: 'kids_checkin', label: 'Check-in dzieci' },
    { key: 'events', label: tr('Wydarzenia') },
    { key: 'email', label: tr('Wysyłka emaili') },
    { key: 'finance', label: tr('Moduł finansowy') },
    { key: 'forms', label: tr('Formularze') },
    { key: 'basic_reports', label: 'Podstawowe raporty' },
    { key: 'advanced_reports', label: 'Zaawansowane raporty' },
    { key: 'api', label: tr('Dostęp do API') },
    { key: 'white_label', label: 'White label' },
    { key: 'priority_support', label: 'Priorytetowe wsparcie' },
    { key: 'custom_domain', label: tr('Własna domena') }
  ];

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    const data = await getPlans(true); // include inactive
    setPlans(data);
  };

  const handleEdit = (plan) => {
    setFormData({
      ...plan,
      features: plan.features || {}
    });
    setEditingPlan(plan.id);
    setShowForm(true);
  };

  const handleNew = () => {
    setFormData({
      name: '',
      slug: '',
      description: '',
      price_monthly: 0,
      price_yearly: 0,
      max_members: -1,
      max_users: -1,
      max_groups: -1,
      max_kids: -1,
      max_events: -1,
      max_storage_mb: 100,
      trial_days: 14,
      features: {},
      is_active: true,
      is_public: true,
      sort_order: plans.length
    });
    setEditingPlan(null);
    setShowForm(true);
  };

  const handleSave = async () => {
    try {
      if (editingPlan) {
        await updatePlan(editingPlan, formData);
      } else {
        await createPlan(formData);
      }
      setShowForm(false);
      loadPlans();
    } catch (err) {
      alert(tr('Błąd zapisu: ') + err.message);
    }
  };

  const handleDelete = async (planId) => {
    if (confirm(tr('Czy na pewno chcesz dezaktywować ten plan?'))) {
      await deactivatePlan(planId);
      loadPlans();
    }
  };

  const toggleFeature = (featureKey) => {
    setFormData(prev => ({
      ...prev,
      features: {
        ...prev.features,
        [featureKey]: !prev.features[featureKey]
      }
    }));
  };

  if (showForm) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {editingPlan ? 'Edycja planu' : 'Nowy plan'}
          </h2>
          <button
            onClick={() => setShowForm(false)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Basic info */}
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900 dark:text-white">Informacje podstawowe</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Nazwa planu
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Slug (URL)
                </label>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/\s/g, '-') })}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Opis
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Cena miesięczna (grosze)
                  </label>
                  <input
                    type="number"
                    value={formData.price_monthly}
                    onChange={(e) => setFormData({ ...formData, price_monthly: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  />
                  <p className="text-xs text-gray-500 mt-1">{formatPrice(formData.price_monthly)}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Cena roczna (grosze)
                  </label>
                  <input
                    type="number"
                    value={formData.price_yearly}
                    onChange={(e) => setFormData({ ...formData, price_yearly: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  />
                  <p className="text-xs text-gray-500 mt-1">{formatPrice(formData.price_yearly)}</p>
                </div>
              </div>
            </div>

            {/* Limits */}
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900 dark:text-white">Limity (-1 = bez limitu)</h3>

              <div className="grid grid-cols-2 gap-4">
                {[
                  { key: 'max_members', label: tr('Członkowie') },
                  { key: 'max_users', label: tr('Użytkownicy') },
                  { key: 'max_groups', label: tr('Grupy') },
                  { key: 'max_kids', label: 'Dzieci' },
                  { key: 'max_events', label: tr('Wydarzenia') },
                  { key: 'max_storage_mb', label: 'Storage (MB)' }
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {label}
                    </label>
                    <input
                      type="number"
                      value={formData[key]}
                      onChange={(e) => setFormData({ ...formData, [key]: parseInt(e.target.value) })}
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Dni trialu
                </label>
                <input
                  type="number"
                  value={formData.trial_days}
                  onChange={(e) => setFormData({ ...formData, trial_days: parseInt(e.target.value) || 14 })}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                />
              </div>

              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Aktywny</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_public}
                    onChange={(e) => setFormData({ ...formData, is_public: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Publiczny</span>
                </label>
              </div>
            </div>
          </div>

          {/* Features */}
          <div className="mt-6">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Funkcje</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {featuresList.map(({ key, label }) => (
                <label
                  key={key}
                  className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition ${
                    formData.features[key]
                      ? 'bg-accent-primary-lightest dark:bg-accent-primary-darkest/20 border-accent-primary-light dark:border-accent-primary'
                      : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  }`}
                  onClick={() => toggleFeature(key)}
                >
                  <div className={`w-5 h-5 rounded flex items-center justify-center ${
                    formData.features[key]
                      ? 'bg-accent-primary text-white'
                      : 'bg-gray-200 dark:bg-gray-700'
                  }`}>
                    {formData.features[key] && <Check size={14} />}
                  </div>
                  <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
            >
              Anuluj
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-accent-primary text-white rounded-lg font-medium hover:shadow-lg transition disabled:opacity-50"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              Zapisz
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Plany subskrypcji
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {tr('Zarządzaj dostępnymi planami')}
          </p>
        </div>
        <button
          onClick={handleNew}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-accent-primary text-white rounded-xl font-medium hover:shadow-lg transition"
        >
          <Plus size={18} />
          Nowy plan
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 ${
              !plan.is_active ? 'opacity-50' : ''
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">{plan.name}</h3>
                <p className="text-sm text-gray-500">{plan.slug}</p>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => handleEdit(plan)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  <Edit size={16} className="text-gray-500" />
                </button>
                <button
                  onClick={() => handleDelete(plan.id)}
                  className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg"
                >
                  <Trash2 size={16} className="text-red-500" />
                </button>
              </div>
            </div>

            <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
              {formatPrice(plan.price_monthly)}
              <span className="text-sm font-normal text-gray-500">/mies.</span>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
              {plan.description}
            </p>

            <div className="flex flex-wrap gap-1">
              {!plan.is_active && (
                <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded text-xs">
                  Nieaktywny
                </span>
              )}
              {!plan.is_public && (
                <span className="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded text-xs">
                  Ukryty
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
