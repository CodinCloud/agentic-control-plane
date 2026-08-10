import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/core';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950',
  {
    variants: {
      variant: {
        default: 'bg-neutral-100 text-neutral-900 hover:bg-white focus-visible:ring-neutral-400',
        outline:
          'border border-neutral-700 bg-transparent text-neutral-200 hover:bg-neutral-800 focus-visible:ring-neutral-500',
        ghost: 'bg-transparent text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100',
        destructive: 'bg-red-600 text-white hover:bg-red-500 focus-visible:ring-red-400',
      },
      size: {
        default: 'h-9 px-3',
        sm: 'h-7 px-2 text-xs',
        icon: 'h-8 w-8',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
