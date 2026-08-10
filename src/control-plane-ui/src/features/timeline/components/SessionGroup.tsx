import type { TimelineSession, TimelineWindow } from '../timelineTypes';
import { SessionBanner } from './SessionBanner';
import { AgentLaneRow } from './AgentLaneRow';

export interface SessionGroupProps {
  session: TimelineSession;
  /** The shared axis window (plan decision #4) — never derived per session. */
  window: TimelineWindow;
  maxBillableTokens: number;
  onSelectAgent: (agentId: string) => void;
}

/**
 * One visual group on the timeline: a session's bandeau followed by its own
 * lanes. Several groups stack, one per session (plan §"Ce qu'il faut
 * faire") — a session with no agent still renders its bandeau plus a
 * discrete note, never the old full-width "aucun agent" placeholder, which
 * only makes sense once *no* session anywhere has an agent (see GanttChart).
 */
export function SessionGroup({ session, window, maxBillableTokens, onSelectAgent }: SessionGroupProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <SessionBanner session={session} />
      {session.lanes.length === 0 ? (
        <p className="pl-1 text-xs text-neutral-600">Aucun agent dans cette session.</p>
      ) : (
        <div className="rounded-md border border-neutral-800">
          {session.lanes.map((lane) => (
            <AgentLaneRow
              key={lane.agentId}
              lane={lane}
              window={window}
              maxBillableTokens={maxBillableTokens}
              onSelect={onSelectAgent}
            />
          ))}
        </div>
      )}
    </div>
  );
}
