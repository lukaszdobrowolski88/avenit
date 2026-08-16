import React from 'react';
import {
  CircleDot, SignalHigh, Type, AlignLeft, Hash, Calendar, CalendarRange,
  Users, Tags, CheckSquare, Link, Paperclip, Star, Columns, Gauge, Sigma, Link2, GitBranch, ArrowRightLeft,
  Mail, Phone, MapPin, ThumbsUp, Timer, Clock, History,
} from 'lucide-react';

const MAP = {
  CircleDot, SignalHigh, Type, AlignLeft, Hash, Calendar, CalendarRange,
  Users, Tags, CheckSquare, Link, Paperclip, Star, Gauge, Sigma, Link2, GitBranch, ArrowRightLeft,
  Mail, Phone, MapPin, ThumbsUp, Timer, Clock, History,
};

// Ikona typu kolumny wg nazwy z rejestru columnTypes.
export default function ColumnIcon({ name, size = 14, className = '' }) {
  const Cmp = MAP[name] || Columns;
  return <Cmp size={size} className={className} />;
}
