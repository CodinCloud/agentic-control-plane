import * as React from 'react';
import { cn } from '@/core';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-neutral-800', className)} {...props} />;
}
