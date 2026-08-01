import { useContext } from 'react';
import { ToastContext, type ToastContextValue } from '@/context/contexts';

export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>.');
  return context;
};
