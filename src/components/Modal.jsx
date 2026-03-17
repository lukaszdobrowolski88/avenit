import { createPortal } from 'react-dom';

/**
 * Modal component that renders children in a portal to document.body
 * This ensures the modal overlay covers the entire screen regardless of parent CSS
 */
export default function Modal({ children, isOpen, className = '' }) {
  if (!isOpen || !document.body) return null;

  return createPortal(
    <div className={`fixed inset-0 z-[100] ${className}`}>
      {children}
    </div>,
    document.body
  );
}
