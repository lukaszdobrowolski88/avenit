// Centralna definicja kategorii powiadomień push (mapowanie kategoria → przyciski).
// Mobile (Expo) wymaga statycznej rejestracji kategorii w aplikacji — zestaw musi
// być zsynchronizowany z packages/mobile/src/lib/notificationCategories.ts.

import { Bell, ExternalLink, FileText, Check, X, MapPin, MessageSquare } from 'lucide-react';

export const PUSH_CATEGORIES = [
  {
    id: 'cm_dismiss_only',
    label: 'Bez przycisków',
    description: 'Klasyczny push — tap otwiera deep link, brak akcji.',
    icon: Bell,
    actions: [],
  },
  {
    id: 'cm_open_link',
    label: 'Otwórz w aplikacji',
    description: '1 przycisk "Otwórz" prowadzący do ekranu w appce.',
    icon: ExternalLink,
    actions: [
      { type: 'deep_link', defaultLabel: 'Otwórz' },
    ],
  },
  {
    id: 'cm_external_url',
    label: 'Otwórz w przeglądarce',
    description: '1 przycisk otwierający zewnętrzny URL.',
    icon: ExternalLink,
    actions: [
      { type: 'external_url', defaultLabel: 'Otwórz' },
    ],
  },
  {
    id: 'cm_form',
    label: 'Wypełnij formularz',
    description: '2 przyciski: "Wypełnij" / "Później".',
    icon: FileText,
    actions: [
      { type: 'open_form', defaultLabel: 'Wypełnij' },
      { type: 'deep_link', defaultLabel: 'Później' },
    ],
  },
  {
    id: 'cm_rsvp_yes_no',
    label: 'Potwierdź obecność (RSVP)',
    description: '2 przyciski: "Potwierdzam" / "Nie mogę". Akcja inline, bez otwierania appki.',
    icon: Check,
    actions: [
      { type: 'inline_rsvp', defaultLabel: 'Potwierdzam', value: 'yes' },
      { type: 'inline_rsvp', defaultLabel: 'Nie mogę', value: 'no', destructive: true },
    ],
  },
];

export const SEGMENT_TYPES = [
  { id: 'all', label: 'Wszyscy aktywni', icon: 'Users' },
  { id: 'campus', label: 'Campus', icon: 'MapPin' },
  { id: 'ministry', label: 'Służba', icon: 'Sparkles' },
  { id: 'home_group', label: 'Grupa domowa', icon: 'Home' },
  { id: 'role', label: 'Rola', icon: 'Shield' },
  { id: 'custom_email', label: 'Wybrane osoby', icon: 'UserCheck' },
];

export const STATUS_CONFIG = {
  draft:     { label: 'Szkic',        color: 'gray',    gradient: 'from-gray-400 to-gray-500' },
  scheduled: { label: 'Zaplanowany',  color: 'amber',   gradient: 'from-amber-400 to-orange-500' },
  sending:   { label: 'Wysyłanie...', color: 'blue',    gradient: 'from-blue-400 to-indigo-500' },
  sent:      { label: 'Wysłany',      color: 'emerald', gradient: 'from-emerald-400 to-teal-500' },
  failed:    { label: 'Błąd',         color: 'red',     gradient: 'from-red-400 to-rose-500' },
  cancelled: { label: 'Anulowany',    color: 'gray',    gradient: 'from-gray-400 to-gray-500' },
};

// Limity tekstu (push truncates inaczej na każdej platformie).
export const TITLE_MAX = 65;
export const BODY_MAX = 240;
export const ACTION_LABEL_MAX = 20;
