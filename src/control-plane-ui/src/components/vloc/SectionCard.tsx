import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/core';

export interface SectionCardProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  /**
   * La carte occupe toute la hauteur que lui laisse son parent flex, et son
   * corps devient la zone de défilement. C'est ce qui permet de répartir
   * l'écran en proportions (la chronologie sur la moitié, par exemple) plutôt
   * qu'en `max-h-[Nvh]` empilés, qui ne garantissent aucune proportion : leur
   * somme dépasse le viewport dès que le contenu est dense, et la page se met à
   * défiler au lieu de tenir.
   */
  fill?: boolean;
}

/** Titled section container — groups a KPI breakdown or the timeline under a heading. */
export function SectionCard({
  title,
  description,
  icon,
  action,
  children,
  className,
  contentClassName,
  fill = false,
}: SectionCardProps) {
  return (
    <Card className={cn(fill && 'flex min-h-0 flex-col overflow-hidden', className)}>
      <CardHeader className={cn('flex-row items-center justify-between gap-2', fill && 'shrink-0')}>
        <div className="flex items-center gap-2">
          {icon ? <span className="text-muted-foreground">{icon}</span> : null}
          <div>
            <CardTitle className="text-base font-semibold text-foreground">{title}</CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
        </div>
        {action}
      </CardHeader>
      <CardContent className={cn('pt-0', fill && 'flex min-h-0 flex-1 flex-col', contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}
