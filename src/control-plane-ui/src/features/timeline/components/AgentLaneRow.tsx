import { cn } from '@/core';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/vloc/StatusBadge';
import { TimelineDomain } from '../domain/TimelineDomain';
import type { AgentLane, TimelineWindow } from '../timelineTypes';
import { LANE_LABEL_COLUMN_CLASS, TIMELINE_GLIDE_CLASS } from './laneLayout';

/** Un cran de retrait par niveau de filiation, en pixels. */
const INDENT_STEP_PX = 14;

/** Les quatre badges doivent tenir sur une ligne dans une colonne de 16rem, retrait compris. */
const LANE_BADGE_CLASS = 'shrink-0 gap-0.5 px-1.5 py-0 text-[11px] leading-5 tabular-nums';

export interface AgentLaneRowProps {
  lane: AgentLane;
  /** Axe partagé de tout le Gantt (plan décision #5) — jamais recalé par lane. */
  window: TimelineWindow;
  maxBillableTokens: number;
  /** Maximum sur l'ensemble des lanes affichées, jamais sur cette seule lane (plan décision #10). */
  maxDensityCount: number;
  now: number;
  selected: boolean;
  onSelect: (agentId: string) => void;
}

/**
 * One agent = one row — la session principale y compris, comme lane 0 (plan
 * 006, décision #4/#5). Largeur = durée, épaisseur = tokens, et une texture de
 * densité d'appels d'outil recouvre la barre : « quand était-ce dense » se lit
 * sans cliquer.
 *
 * Depuis le plan 007 la rangée porte aussi la **filiation** : un sous-agent est
 * décalé d'un cran par niveau de `spawnDepth` et rattaché à sa session par un
 * rail vertical. Rien ne distinguait auparavant un sous-agent de la session qui
 * l'avait lancé, alors que c'est précisément la question que l'outil sert à
 * trancher (décision #7).
 */
export function AgentLaneRow({
  lane,
  window,
  maxBillableTokens,
  maxDensityCount,
  now,
  selected,
  onSelect,
}: AgentLaneRowProps) {
  const ongoing = TimelineDomain.isOngoing(lane);
  const { leftPct, widthPct } = TimelineDomain.barPosition(lane, window, now);
  const heightPx = TimelineDomain.barHeightPx(lane.billableTokens, maxBillableTokens);
  const side = TimelineDomain.labelSide(leftPct, widthPct);
  const color = TimelineDomain.laneColor(lane);
  const durationLabel = TimelineDomain.formatDuration(TimelineDomain.effectiveDurationMs(lane));
  const tokensLabel = TimelineDomain.formatTokens(lane.billableTokens);
  const label = lane.isMainSession ? 'Session principale' : lane.agentType ?? 'Agent';
  const cells = TimelineDomain.densityCells(lane, window, window.grid, window.contentSince, maxDensityCount, now);
  const indentPx = TimelineDomain.laneIndentDepth(lane) * INDENT_STEP_PX;

  return (
    <div
      className={cn(
        'group relative flex items-center gap-3 border-b border-border/60 py-1.5 last:border-b-0',
        selected && 'bg-accent/40',
      )}
    >
      <div className={cn(LANE_LABEL_COLUMN_CLASS, 'relative min-w-0')} style={{ paddingLeft: `${indentPx}px` }}>
        {/* Le rail de filiation : il ne part que des sous-agents, et il pointe
            vers la lane principale qui les surplombe. */}
        {indentPx > 0 ? (
          <span
            aria-hidden="true"
            className="absolute bottom-1/2 top-0 w-px border-l border-border"
            style={{ left: `${indentPx - 8}px` }}
          >
            <span className="absolute bottom-0 left-0 h-px w-1.5 bg-border" />
          </span>
        ) : null}

        <div className="flex items-center gap-1.5">
          <span
            className={cn('h-2 w-2 shrink-0 rounded-full', ongoing && 'animate-pulse')}
            style={{ backgroundColor: color }}
            aria-hidden="true"
          />
          <span
            className={cn('truncate text-sm', lane.isMainSession ? 'font-medium text-foreground' : 'font-semibold')}
            style={lane.isMainSession ? undefined : { color }}
            title={label}
          >
            {label}
          </span>
          {ongoing ? (
            <StatusBadge tone="warning" className="shrink-0">
              en cours
            </StatusBadge>
          ) : null}
        </div>

        {lane.taskDescription ? (
          <div className="truncate text-xs text-muted-foreground" title={lane.taskDescription}>
            {lane.taskDescription}
          </div>
        ) : null}

        {/* Bandeau de badges — repris tel quel de disler (plan §"Ce qu'on
            reprend"), conservé sur décision de l'auteur (plan 007, décision #8).
            Seule leur taille change : en `text-sm px-2.5` les quatre
            dépassaient les 256 px de la colonne et passaient à la ligne, ce qui
            décalait la rangée entière (défaut visible sur la capture du
            2026-08-11). Compactés, ils tiennent sur une ligne même retraités. */}
        <div className="mt-0.5 flex flex-nowrap items-center gap-1">
          <Badge variant="outline" className={LANE_BADGE_CLASS} title="Modèle">
            🧠 {TimelineDomain.shortModelLabel(lane.model)}
          </Badge>
          <Badge variant="outline" className={LANE_BADGE_CLASS} title="Événements">
            ⚡ {lane.eventCount}
          </Badge>
          <Badge variant="outline" className={LANE_BADGE_CLASS} title="Appels d'outil">
            🔧 {lane.toolCallCount}
          </Badge>
          <Badge variant="outline" className={LANE_BADGE_CLASS} title="Écart moyen entre événements">
            🕐 {TimelineDomain.formatDuration(lane.avgGapMs)}
          </Badge>
        </div>
      </div>

      <div className="relative h-11 flex-1">
        <button
          type="button"
          onClick={() => onSelect(lane.agentId)}
          aria-pressed={selected}
          title={`${lane.agentId} — ${lane.taskDescription ?? label}`}
          className={cn(
            'absolute top-1/2 flex -translate-y-1/2 items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            side === 'left' ? 'flex-row-reverse' : 'flex-row',
            // Le glissement : la fenêtre bouge sous la barre, dont les instants
            // sont absolus — c'est donc `left`/`width` qui varient (plan 007 #3).
            TIMELINE_GLIDE_CLASS,
          )}
          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
        >
          {/*
            La texture : un rectangle SVG par bucket recouvert, opacité
            proportionnelle à count/max de toute la réponse (plan décision
            #10) — jamais de canvas, jamais de boucle d'animation (décision
            #9), on redessine quand la donnée change. Cellules contiguës,
            sans gouttière : c'est une bande de densité continue.
          */}
          <span
            className={cn(
              'relative block w-full overflow-hidden rounded-sm border border-border/80',
              ongoing && 'ring-1 ring-primary/70',
            )}
            style={{ height: `${heightPx}px`, minWidth: '3px', backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)` }}
          >
            <svg
              className="absolute inset-0 h-full w-full"
              preserveAspectRatio="none"
              viewBox="0 0 100 100"
              aria-hidden="true"
            >
              {cells.map((cell) => (
                <rect key={cell.bucketIndex} x={cell.leftPct} y={0} width={cell.widthPct} height={100} fill={color} opacity={cell.opacity}>
                  {/* Survol honnête : compte exact et tranche horaire du bucket (plan §"Survol"). */}
                  <title>{`${cell.count} appel${cell.count === 1 ? '' : 's'} · ${TimelineDomain.formatClock(cell.startIso)}–${TimelineDomain.formatClock(cell.endIso)}`}</title>
                </rect>
              ))}
            </svg>
          </span>
          <span
            className={cn(
              'whitespace-nowrap text-xs tabular-nums text-muted-foreground',
              side === 'left' ? 'mr-1.5' : 'ml-1.5',
            )}
          >
            {durationLabel} · {tokensLabel} tk
          </span>
        </button>
      </div>
    </div>
  );
}
