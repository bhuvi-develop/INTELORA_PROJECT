import { useContext } from 'react';
import { UIContext, type UIContextValue } from '@/context/contexts';

export const useUI = (): UIContextValue => {
  const context = useContext(UIContext);
  if (!context) throw new Error('useUI must be used inside <UIProvider>.');
  return context;
};
