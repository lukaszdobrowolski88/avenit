import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAvailablePlans, formatPrice } from '../../lib/subscriptions';
import {
  Church,
  Users,
  Calendar,
  Baby,
  FileText,
  Shield,
  Check,
  ArrowRight,
  Sparkles,
  Mail,
  Phone,
  MapPin,
  Star
} from 'lucide-react';
import { tr } from '../../i18n';

export default function LandingPage() {
  const [plans, setPlans] = useState([]);
  const [billingCycle, setBillingCycle] = useState('monthly');

  useEffect(() => {
    const loadPlans = async () => {
      const data = await getAvailablePlans();
      setPlans(data);
    };
    loadPlans();
  }, []);

  const features = [
    {
      icon: Users,
      title: tr('Zarządzanie członkami'),
      description: tr('Kompletna baza członków z historią, grupami i kontaktami.')
    },
    {
      icon: Calendar,
      title: 'Kalendarz i wydarzenia',
      description: tr('Planuj wydarzenia, nabożeństwa i spotkania w jednym miejscu.')
    },
    {
      icon: Baby,
      title: 'Check-in dzieci',
      description: 'Bezpieczny system rejestracji dzieci z etykietami i kodami odbioru.'
    },
    {
      icon: FileText,
      title: 'Formularze online',
      description: tr('Twórz formularze zgłoszeniowe, ankiety i zbieraj dane.')
    },
    {
      icon: Mail,
      title: 'Komunikacja',
      description: tr('Wysyłaj newslettery, ogłoszenia i powiadomienia do członków.')
    },
    {
      icon: Shield,
      title: tr('Bezpieczeństwo'),
      description: tr('Dane są szyfrowane i przechowywane zgodnie z RODO.')
    }
  ];

  const testimonials = [
    {
      name: 'Pastor Jan Kowalski',
      church: 'Kościół Łaski, Warszawa',
      text: tr('Avenit zrewolucjonizowało sposób, w jaki zarządzamy naszą społecznością. Oszczędzamy godziny pracy tygodniowo!')
    },
    {
      name: 'Anna Nowak',
      church: 'Zbór Nowe Życie, Kraków',
      text: tr('System check-in dzieci to game changer. Rodzice czują się bezpiecznie, a my mamy pełną kontrolę.')
    },
    {
      name: 'Marek Wiśniewski',
      church: 'Kościół Baptystyczny, Poznań',
      text: tr('Intuicyjny interfejs i świetne wsparcie techniczne. Polecam każdemu kościołowi!')
    }
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <Church size={28} className="text-accent-primary" />
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                Avenit
              </span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-gray-600 dark:text-gray-300 hover:text-accent-primary transition">
                Funkcje
              </a>
              <a href="#pricing" className="text-gray-600 dark:text-gray-300 hover:text-accent-primary transition">
                Cennik
              </a>
              <a href="#contact" className="text-gray-600 dark:text-gray-300 hover:text-accent-primary transition">
                Kontakt
              </a>
            </div>
            <div className="flex items-center gap-4">
              <Link
                to="/login"
                className="text-gray-600 dark:text-gray-300 hover:text-accent-primary transition"
              >
                {tr('Zaloguj się')}
              </Link>
              <Link
                to="/register"
                className="px-4 py-2 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-lg font-medium hover:shadow-lg transition"
              >
                {tr('Wypróbuj za darmo')}
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-accent-primary-lighter dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light rounded-full text-sm font-medium mb-6">
            <Sparkles size={16} />
            14 dni za darmo, bez karty kredytowej
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white mb-6 leading-tight">
            {tr('Nowoczesne zarządzanie')}
            <br />
            <span className="bg-gradient-to-r from-accent-primary to-accent-secondary bg-clip-text text-transparent">
              {tr('Twoim kościołem')}
            </span>
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto mb-10">
            Wszystko, czego potrzebujesz do zarządzania członkami, wydarzeniami,
            grupami i check-inem dzieci - w jednej aplikacji.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/register"
              className="flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-xl font-semibold text-lg hover:shadow-xl transition"
            >
              Rozpocznij za darmo
              <ArrowRight size={20} />
            </Link>
            <a
              href="#features"
              className="flex items-center gap-2 px-8 py-4 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl font-semibold text-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition"
            >
              Zobacz funkcje
            </a>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-800/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Wszystko, czego potrzebujesz
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              {tr('Kompleksowe narzędzia do zarządzania każdym aspektem działalności kościoła')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div
                  key={index}
                  className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 hover:border-accent-primary-light dark:hover:border-accent-primary transition"
                >
                  <div className="w-12 h-12 bg-accent-primary-lighter dark:bg-accent-primary-darkest/30 rounded-xl flex items-center justify-center mb-4">
                    <Icon size={24} className="text-accent-primary dark:text-accent-primary-light" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Prosty i przejrzysty cennik
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto mb-8">
              {tr('Wybierz plan dopasowany do wielkości Twojego kościoła')}
            </p>

            {/* Billing toggle */}
            <div className="inline-flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`px-6 py-2.5 rounded-lg text-sm font-medium transition ${
                  billingCycle === 'monthly'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow'
                    : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                {tr('Miesięcznie')}
              </button>
              <button
                onClick={() => setBillingCycle('yearly')}
                className={`px-6 py-2.5 rounded-lg text-sm font-medium transition flex items-center gap-2 ${
                  billingCycle === 'yearly'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow'
                    : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                Rocznie
                <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs px-2 py-0.5 rounded-full">
                  -17%
                </span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map((plan, index) => {
              const isPopular = plan.slug === 'standard';
              const price = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly;

              return (
                <div
                  key={plan.id}
                  className={`relative bg-white dark:bg-gray-800 rounded-2xl border-2 p-6 ${
                    isPopular
                      ? 'border-accent-primary-light shadow-xl shadow-accent-primary-light/20'
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="inline-flex items-center gap-1 bg-gradient-to-r from-accent-primary to-accent-secondary text-white text-xs font-bold px-3 py-1 rounded-full">
                        <Sparkles size={12} />
                        NAJPOPULARNIEJSZY
                      </span>
                    </div>
                  )}

                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                    {plan.name}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 min-h-[40px]">
                    {plan.description}
                  </p>

                  <div className="mb-6">
                    <span className="text-3xl font-bold text-gray-900 dark:text-white">
                      {formatPrice(price)}
                    </span>
                    <span className="text-gray-500">
                      /{billingCycle === 'yearly' ? 'rok' : 'mies.'}
                    </span>
                  </div>

                  <ul className="space-y-3 mb-6">
                    <li className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <Check size={16} className="text-green-500" />
                      {plan.max_members === -1 ? 'Bez limitu' : plan.max_members} członków
                    </li>
                    <li className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <Check size={16} className="text-green-500" />
                      {plan.max_users === -1 ? 'Bez limitu' : plan.max_users} użytkowników
                    </li>
                    <li className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <Check size={16} className="text-green-500" />
                      {plan.trial_days} dni trial
                    </li>
                  </ul>

                  <Link
                    to="/register"
                    className={`block w-full py-3 rounded-xl font-medium text-center transition ${
                      isPopular
                        ? 'bg-gradient-to-r from-accent-primary to-accent-secondary text-white hover:shadow-lg'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    Rozpocznij trial
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-800/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              {tr('Co mówią nasi klienci')}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <div
                key={index}
                className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700"
              >
                <div className="flex gap-1 mb-4">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Star key={i} size={16} className="fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  "{testimonial.text}"
                </p>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-white">
                    {testimonial.name}
                  </div>
                  <div className="text-sm text-gray-500">
                    {testimonial.church}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Gotowy, aby zacząć?
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
            Dołącz do setek kościołów, które już korzystają z Avenit.
            Wypróbuj za darmo przez 14 dni.
          </p>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-xl font-semibold text-lg hover:shadow-xl transition"
          >
            Rozpocznij za darmo
            <ArrowRight size={20} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer id="contact" className="py-12 px-4 sm:px-6 lg:px-8 bg-gray-900 dark:bg-black">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Church size={24} className="text-accent-primary-light" />
                <span className="text-lg font-bold text-white">Avenit</span>
              </div>
              <p className="text-gray-400 text-sm">
                {tr('Nowoczesne oprogramowanie do zarządzania kościołem.')}
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-white mb-4">Produkt</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><a href="#features" className="hover:text-white transition">Funkcje</a></li>
                <li><a href="#pricing" className="hover:text-white transition">Cennik</a></li>
                <li><Link to="/login" className="hover:text-white transition">Logowanie</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-white mb-4">Firma</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><a href="#" className="hover:text-white transition">O nas</a></li>
                <li><a href="#" className="hover:text-white transition">{tr('Polityka prywatności')}</a></li>
                <li><a href="#" className="hover:text-white transition">Regulamin</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-white mb-4">Kontakt</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li className="flex items-center gap-2">
                  <Mail size={14} />
                  kontakt@avenit.pl
                </li>
                <li className="flex items-center gap-2">
                  <Phone size={14} />
                  +48 123 456 789
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-800 pt-8 text-center text-gray-400 text-sm">
            © {new Date().getFullYear()} Avenit. Wszystkie prawa zastrzeżone.
          </div>
        </div>
      </footer>
    </div>
  );
}
