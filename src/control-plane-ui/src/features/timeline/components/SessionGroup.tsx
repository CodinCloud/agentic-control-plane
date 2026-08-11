import type { TimelineSession, TimelineWindow } from '../timelineTypes';
import { SessionBanner } from './SessionBanner';
import { AgentLaneRow } from './AgentLaneRow';

export interface SessionGroupProps {
  session: TimelineSession;
  /** The shared axis window (plan decision #4) — never derived per session. */
  window: TimelineWindow;
  maxBillableTokens: number;
  /** Maximum sur l'ensemble des lanes affichées, jamais sur la seule session (plan décision #10). */
  maxDensityCount: number;
  now: number;
  /** `agentId` sélectionné **dans cette session**, déjà démêlé du jeton composite. */
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
}

/**
 * One visual group on the timeline: a session's header followed by its own
 * lanes, la principale en premier (plan 006, décisions #4/#5). Une session
 * contient toujours au moins un agent — elle-même — donc `session.lanes`
 * n'est jamais vide et il n'y a plus de garde à écrire ici.
 */
export function SessionGroup({
  session,
  window,
  maxBillableTokens,
  maxDensityCount,
  now,
  selectedAgentId,
  onSelectAgent,
}: SessionGroupProps) {
  return (
    <div className="flex flex-col gap-1">
      <SessionBanner session={session} now={now} />
      <div className="rounded-md border border-border bg-card/20">
        {session.lanes.map((lane) => (
          <AgentLaneRow
            key={lane.agentId}
            lane={lane}
            window={window}
            maxBillableTokens={maxBillableTokens}
            maxDensityCount={maxDensityCount}
            now={now}
            selected={selectedAgentId === lane.agentId}
            onSelect={onSelectAgent}
          />
        ))}
      </div>
    </div>
  );
}
