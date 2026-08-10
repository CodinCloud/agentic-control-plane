import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/core';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

/**
 * Native <select>, styled to match the design system. No Radix dependency
 * is installed in this project, so filter dropdowns use the native element
 * rather than a shadcn Combobox.
 */
export function Select({ className, children, ...props }: SelectProps) {
  return (
    <div className="relative inline-flex">
      <select
        className={cn(
          'h-8 appearance-none rounded-md border border-neutral-700 bg-neutral-900 pl-2 pr-7 text-xs text-neutral-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500',
          'disabled:opacity-50',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500"
        aria-hidden="true"
      />
    </div>
  );
}
