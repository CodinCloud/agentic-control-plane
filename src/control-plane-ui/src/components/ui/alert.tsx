import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/core';

const alertVariants = cva('flex items-start gap-3 rounded-lg border p-4 text-base', {
  variants: {
    variant: {
      default: 'border-border bg-card text-muted-foreground',
      destructive: 'border-destructive/30 bg-destructive/10 text-destructive',
    },
  },
  defaultVariants: { variant: 'default' },
});

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {}

export function Alert({ className, variant, ...props }: AlertProps) {
  return <div role="status" className={cn(alertVariants({ variant }), className)} {...props} />;
}

export function AlertTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h4 className={cn('font-medium text-foreground', className)} {...props} />;
}

export function AlertDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-muted-foreground', className)} {...props} />;
}
