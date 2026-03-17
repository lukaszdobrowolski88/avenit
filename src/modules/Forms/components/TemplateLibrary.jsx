import { useState } from 'react';
import {
  Calendar,
  MessageSquare,
  Mail,
  Heart,
  FileText,
  Star,
  ArrowRight
} from 'lucide-react';

const CATEGORY_ICONS = {
  events: Calendar,
  feedback: MessageSquare,
  contact: Mail,
  prayer: Heart,
  default: FileText
};

const CATEGORY_LABELS = {
  events: 'Wydarzenia',
  feedback: 'Opinie',
  contact: 'Kontakt',
  prayer: 'Modlitwa'
};

export default function TemplateLibrary({ templates, onSelectTemplate }) {
  const [selectedCategory, setSelectedCategory] = useState('all');

  const builtInTemplates = templates.filter(t => !t.created_at);
  const userTemplates = templates.filter(t => t.created_at);

  const categories = ['all', ...new Set(templates.map(t => t.category || t.template_category).filter(Boolean))];

  const filteredTemplates = selectedCategory === 'all'
    ? templates
    : templates.filter(t => (t.category || t.template_category) === selectedCategory);

  const getCategoryIcon = (category) => {
    return CATEGORY_ICONS[category] || CATEGORY_ICONS.default;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
              selectedCategory === cat
                ? 'bg-gradient-to-r from-pink-500 to-orange-500 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {cat === 'all' ? 'Wszystkie' : (CATEGORY_LABELS[cat] || cat)}
          </button>
        ))}
      </div>

      {builtInTemplates.length > 0 && (selectedCategory === 'all' || builtInTemplates.some(t => (t.category || t.template_category) === selectedCategory)) && (
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
            <Star size={16} className="text-yellow-500" />
            Szablony wbudowane
          </h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {builtInTemplates
              .filter(t => selectedCategory === 'all' || (t.category || t.template_category) === selectedCategory)
              .map((template) => {
                const Icon = getCategoryIcon(template.category || template.template_category);
                return (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    icon={Icon}
                    onSelect={onSelectTemplate}
                  />
                );
              })}
          </div>
        </div>
      )}

      {userTemplates.length > 0 && (selectedCategory === 'all' || userTemplates.some(t => (t.category || t.template_category) === selectedCategory)) && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
            Moje szablony
          </h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {userTemplates
              .filter(t => selectedCategory === 'all' || (t.category || t.template_category) === selectedCategory)
              .map((template) => {
                const Icon = getCategoryIcon(template.category || template.template_category);
                return (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    icon={Icon}
                    onSelect={onSelectTemplate}
                  />
                );
              })}
          </div>
        </div>
      )}

      {filteredTemplates.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-center">
          <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-3">
            <FileText size={24} className="text-gray-400" />
          </div>
          <p className="text-gray-500 dark:text-gray-400">
            Brak szablonów w tej kategorii
          </p>
        </div>
      )}
    </div>
  );
}

function TemplateCard({ template, icon: Icon, onSelect }) {
  const fieldsCount = (template.fields || []).length;

  return (
    <div
      onClick={() => onSelect(template)}
      className="group bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 cursor-pointer hover:shadow-lg hover:border-pink-300 dark:hover:border-pink-600 transition-all"
    >
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-gradient-to-br from-pink-50 to-orange-50 dark:from-pink-900/30 dark:to-orange-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
          <Icon size={24} className="text-pink-600 dark:text-pink-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-white group-hover:text-pink-600 dark:group-hover:text-pink-400 transition-colors">
            {template.title}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
            {template.description}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {fieldsCount} {fieldsCount === 1 ? 'pole' : 'pól'}
        </span>
        <span className="flex items-center gap-1 text-sm font-medium text-pink-600 dark:text-pink-400 opacity-0 group-hover:opacity-100 transition-opacity">
          Użyj szablonu
          <ArrowRight size={14} />
        </span>
      </div>
    </div>
  );
}
