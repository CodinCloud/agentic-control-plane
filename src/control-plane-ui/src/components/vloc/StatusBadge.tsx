import * as React from 'react';
import { Badge } from '@/components/ui/badge';

export type StatusTone = 'success' | 'destructive' | 'warning' | 'neutral';

const TONE_VARIANT = {
  success: 'success',
  destructive: 'destructive',
  warning: 'warning',
  neutral: 'outline',
} as const;

export interface StatusBadgeProps {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
}

/** Semantic status pill — success / failure / pending, used across the timeline and KPI tiles. */
export function StatusBadge({ tone, children, className }: StatusBadgeProps) {
  return (
    <Badge variant={TONE_VARIANT[tone]} className={className}>
      {children}
    </Badge>
  );
}
