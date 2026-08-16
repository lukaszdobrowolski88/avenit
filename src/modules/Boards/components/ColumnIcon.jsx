import React from 'react';
import {
  CircleDot, SignalHigh, Type, AlignLeft, Hash, Calendar, CalendarRange,
  Users, Tags, CheckSquare, Link, Paperclip, Star, Columns, Gauge, Sigma, Link2, GitBranch, ArrowRightLeft,
} from 'lucide-react';

const MAP = {
  CircleDot, SignalHigh, Type, AlignLeft, Hash, Calendar, CalendarRange,
  Users, Tags, CheckSquare, Link, Paperclip, Star, Gauge, Sigma, Link2, GitBranch, ArrowRightLeft,
};

// Ikona typu kolumny wg nazwy z rejestru columnTypes.
export default function ColumnIcon({ name, size = 14, className = '' }) {
  const Cmp = MAP[name] || Columns;
  return <Cmp size={size} className={className} />;
}
