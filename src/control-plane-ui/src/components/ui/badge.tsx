import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/core';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm font-medium',
  {
    variants: {
      variant: {
        default: 'border-border bg-secondary text-foreground',
        success: 'border-status-good/30 bg-status-good/10 text-status-good',
        destructive: 'border-status-critical/30 bg-status-critical/10 text-status-critical',
        warning: 'border-status-warning/30 bg-status-warning/10 text-status-warning',
        outline: 'border-border bg-transparent text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
