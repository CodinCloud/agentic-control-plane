import * as React from 'react';
import { Inbox, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export interface EmptyStateProps {
  title: string;
  description?: React.ReactNode;
  variant?: 'empty' | 'error';
  action?: React.ReactNode;
}

/** Explicit empty / error placeholder — this tool must never show a silent blank screen. */
export function EmptyState({ title, description, variant = 'empty', action }: EmptyStateProps) {
  const Icon = variant === 'error' ? TriangleAlert : Inbox;
  return (
    <Alert variant={variant === 'error' ? 'destructive' : 'default'}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="flex-1">
        <AlertTitle>{title}</AlertTitle>
        {description ? <AlertDescription>{description}</AlertDescription> : null}
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    </Alert>
  );
}
