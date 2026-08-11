import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/core';

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: 'default' | 'success' | 'destructive' | 'warning';
  className?: string;
}

const TONE_VALUE_CLASS: Record<NonNullable<StatCardProps['tone']>, string> = {
  default: 'text-foreground',
  success: 'text-status-good',
  destructive: 'text-status-critical',
  warning: 'text-status-warning',
};

/** KPI tile — the primary building block of the dashboard (Slice 6). */
export function StatCard({ label, value, hint, icon, tone = 'default', className }: StatCardProps) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader className="flex-row items-center justify-between gap-2 pb-0">
        <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">{label}</CardTitle>
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      </CardHeader>
      <CardContent className="pt-1">
        <div className={cn('text-3xl font-semibold', TONE_VALUE_CLASS[tone])}>{value}</div>
        {hint ? <div className="mt-1 text-sm text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}
