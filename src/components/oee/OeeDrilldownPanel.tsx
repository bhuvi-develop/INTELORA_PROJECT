import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface OeeDrilldownPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const OeeDrilldownPanel = ({ isOpen, onClose, title, children }: OeeDrilldownPanelProps) => {
  if (!isOpen) return null;

  return (
    <>
      <div 
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-card shadow-2xl border-l border-overlay/[0.06] overflow-y-auto transform transition-transform duration-300">
        <div className="p-4 border-b border-overlay/[0.06] flex items-center justify-between sticky top-0 bg-card z-10">
          <h2 className="text-lg font-semibold text-fg">{title}</h2>
          <Button variant="secondary" size="sm" icon={X} onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </div>
    </>
  );
};
