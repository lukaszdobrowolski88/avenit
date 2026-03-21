import React, { createContext, useContext } from 'react';
import { useNotifications } from '../hooks/useNotifications';

const NotificationContext = createContext(null);

export function NotificationProvider({ userEmail, children }) {
  const notificationState = useNotifications(userEmail);

  return (
    <NotificationContext.Provider value={notificationState}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotificationContext() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotificationContext must be used within a NotificationProvider');
  }
  return context;
}

export default NotificationContext;
