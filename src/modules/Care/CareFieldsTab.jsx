import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import FieldDefsTab from './tabs/FieldDefsTab';

// Samodzielny wrapper globalnego menedżera definicji pól własnych członków —
// do osadzenia jako zakładka „Opieka" w module Członkowie (po scaleniu z Opieką/CRM).
export default function CareFieldsTab() {
  const [fields, setFields] = useState([]);
  const refreshFields = useCallback(async () => {
    try {
      const { data } = await supabase.from('member_custom_fields').select('*')
        .order('sort_order', { ascending: true }).order('created_at', { ascending: true });
      setFields(data || []);
    } catch { setFields([]); }
  }, []);
  useEffect(() => { refreshFields(); }, [refreshFields]);
  return <FieldDefsTab fields={fields} refreshFields={refreshFields} />;
}
