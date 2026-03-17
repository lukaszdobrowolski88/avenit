import React from 'react';
import { User } from 'lucide-react';
import { getInitials, stringToColor } from '../utils/messageHelpers';
import { statusColors, statusLabels } from '../../../hooks/usePresence';

export default function UserAvatar({ user, size = 'md', className = '', showStatus = false, status = null }) {
  const sizeClasses = {
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-lg'
  };

  const statusSizeClasses = {
    xs: 'w-2 h-2 right-0 bottom-0',
    sm: 'w-3 h-3 right-0 bottom-0',
    md: 'w-3.5 h-3.5 right-0 bottom-0',
    lg: 'w-4 h-4 right-0 bottom-0',
    xl: 'w-5 h-5 right-0 bottom-0'
  };

  const name = user?.full_name || user?.email || '';
  const initials = getInitials(name);
  const bgColor = stringToColor(user?.email || name);
  const statusColor = status ? statusColors[status] : statusColors.offline;
  const statusLabel = status ? statusLabels[status] : statusLabels.offline;

  const renderStatusIndicator = () => {
    if (!showStatus) return null;

    return (
      <span
        className={`absolute ${statusSizeClasses[size]} ${statusColor} rounded-full border-[2.5px] border-white dark:border-gray-900`}
        title={statusLabel}
      />
    );
  };

  if (user?.avatar_url) {
    return (
      <div className={`relative ${sizeClasses[size]} ${className}`}>
        <img
          src={user.avatar_url}
          alt={name}
          className="w-full h-full rounded-full object-cover ring-2 ring-white dark:ring-gray-800"
        />
        {renderStatusIndicator()}
      </div>
    );
  }

  return (
    <div className={`relative ${sizeClasses[size]} ${className}`}>
      <div
        className="w-full h-full rounded-full flex items-center justify-center font-semibold text-white ring-2 ring-white dark:ring-gray-800"
        style={{ backgroundColor: bgColor }}
      >
        {initials || <User size={size === 'xs' ? 12 : size === 'sm' ? 14 : size === 'lg' ? 20 : size === 'xl' ? 24 : 16} />}
      </div>
      {renderStatusIndicator()}
    </div>
  );
}
