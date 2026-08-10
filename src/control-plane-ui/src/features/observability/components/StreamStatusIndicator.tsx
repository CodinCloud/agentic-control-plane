import type { ReactNode } from 'react';
import { Wifi, WifiOff, LoaderCircle } from 'lucide-react';
import { StatusBadge } from '@/components/vloc/StatusBadge';
import type { StreamStatus } from '../hooks/useEventStream';

const STATUS_CONFIG: Record<StreamStatus, { label: string; tone: 'success' | 'warning' | 'destructive'; icon: ReactNode }> = {
  open: { label: 'en direct', tone: 'success', icon: <Wifi className="h-3 w-3" /> },
  connecting: { label: 'connexion…', tone: 'warning', icon: <LoaderCircle className="h-3 w-3 animate-spin" /> },
  reconnecting: { label: 'reconnexion…', tone: 'warning', icon: <LoaderCircle className="h-3 w-3 animate-spin" /> },
  closed: { label: 'hors ligne', tone: 'destructive', icon: <WifiOff className="h-3 w-3" /> },
};

export interface StreamStatusIndicatorProps {
  status: StreamStatus;
}

export function StreamStatusIndicator({ status }: StreamStatusIndicatorProps) {
  const config = STATUS_CONFIG[status];
  return (
    <StatusBadge tone={config.tone} className="items-center">
      {config.icon}
      {config.label}
    </StatusBadge>
  );
}
