import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import EventsTab from '../../shared/EventsTab';
import WallTab from '../../shared/WallTab';
import ScheduleTab from '../../shared/ScheduleTab';
import DutyTab from '../../shared/DutyTab';
import MaterialsTab from '../../shared/MaterialsTab';
import EquipmentTab from '../../shared/EquipmentTab';
import GalleryTab from '../../shared/GalleryTab';
import LinksTab from '../../shared/LinksTab';
import ContactsTab from '../../shared/ContactsTab';
import MembersTab from './MembersTab';
import TasksTab from './TasksTab';
import FinanceWidget from './FinanceWidget';

// Typy gotowych widgetów danych (zakładki systemowe → też elementy kreatora).
export const WIDGET_TYPES = ['events', 'tasks', 'finance', 'members', 'wall', 'schedule', 'duty', 'materials', 'equipment', 'gallery', 'links', 'contacts'];

// Widgety renderujące WŁASNĄ kartę-sekcję — nie owijać ich dodatkowym <section>.
export const SELF_WRAPPING_WIDGETS = new Set(['finance']);

// Jedno miejsce montujące gotowe widgety danych. Używane przez CustomModule
// (zakładki „klasyczne") ORAZ przez kreator graficzny (element 'widget'), aby ich
// zachowanie było IDENTYCZNE wszędzie i zgodne z modułami systemowymi. Widget sam
// dociąga bieżącego użytkownika (email/nazwa), więc oba miejsca użycia są bezobsługowe.
export default function ModuleWidget({ widgetType, moduleKey, moduleName, moduleId, tabId, canEdit = true }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !alive) return;
      setEmail(user.email);
      const { data } = await supabase.from('app_users').select('full_name').eq('email', user.email).single();
      if (alive && data) setName(data.full_name);
    })();
    return () => { alive = false; };
  }, []);

  switch (widgetType) {
    case 'events':    return <EventsTab ministry={moduleKey} currentUserEmail={email} />;
    case 'tasks':     return <TasksTab moduleKey={moduleKey} moduleName={moduleName} currentUserEmail={email} />;
    case 'finance':   return <FinanceWidget moduleKey={moduleKey} moduleName={moduleName} />;
    case 'members':   return <MembersTab moduleKey={moduleKey} moduleName={moduleName} />;
    case 'wall':      return <WallTab ministry={moduleKey} currentUserEmail={email} currentUserName={name} />;
    case 'schedule':  return <ScheduleTab moduleKey={moduleKey} moduleName={moduleName} />;
    case 'duty':      return <DutyTab moduleKey={moduleKey} moduleName={moduleName} />;
    case 'materials': return <MaterialsTab moduleKey={moduleKey} canEdit={canEdit} />;
    case 'equipment': return <EquipmentTab ministryKey={moduleKey} currentUserEmail={email} canEdit={canEdit} />;
    case 'gallery':   return <GalleryTab moduleKey={moduleKey} moduleId={moduleId} tabId={tabId} canEdit={canEdit} />;
    case 'links':     return <LinksTab moduleKey={moduleKey} moduleId={moduleId} tabId={tabId} canEdit={canEdit} />;
    case 'contacts':  return <ContactsTab moduleKey={moduleKey} moduleId={moduleId} tabId={tabId} canEdit={canEdit} />;
    default:          return null;
  }
}
