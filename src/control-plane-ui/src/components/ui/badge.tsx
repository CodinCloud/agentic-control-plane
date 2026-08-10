import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/core';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default: 'border-neutral-700 bg-neutral-800 text-neutral-200',
        success: 'border-emerald-800 bg-emerald-950 text-emerald-400',
        destructive: 'border-red-800 bg-red-950 text-red-400',
        warning: 'border-amber-800 bg-amber-950 text-amber-400',
        outline: 'border-neutral-700 bg-transparent text-neutral-400',
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
