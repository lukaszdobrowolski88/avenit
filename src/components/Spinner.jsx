import React from 'react';
import { Loader2 } from 'lucide-react';

// Wspólny spinner — zamiast 340+ ręcznych Loader2/animate-spin.
export default function Spinner({ size = 24, className = '', center = false, label }) {
  const el = (
    <span className={`inline-flex items-center gap-2 text-gray-400 ${className}`}>
      <Loader2 size={size} className="animate-spin" />
      {label && <span className="text-sm">{label}</span>}
    </span>
  );
  return center ? <div className="flex items-center justify-center py-10 w-full">{el}</div> : el;
}
