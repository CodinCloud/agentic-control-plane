import { describe, expect, it } from 'vitest';
import { TimelineDomain } from './TimelineDomain';
import type { AgentLane } from '../timelineTypes';

/**
 * Oracles de la spec 007. Ce qui est testé ici est *arithmétique* — la
 * géométrie de la fenêtre, le découpage des graduations, le comptage du
 * parallélisme — donc exactement ce qui mérite un test plutôt qu'un coup d'œil.
 * Le rendu, lui, reste du jugement humain et la DoD le déclare comme tel.
 */

const MINUTE = 60_000;
const NOW = Date.parse('2026-08-11T14:00:00.000Z');

/**
 * Une fenêtre transite par des chaînes ISO, donc par des millisecondes
 * entières : la marge de futur (`span × 15/85`) perd sa fraction à
 * l'arrondi. Sur dix minutes cela déplace le repère de deux cent-millièmes de
 * pourcent — trois ordres de grandeur sous le pixel. Les tolérances ci-dessous
 * mesurent donc ce qui est observable, pas la virgule flottante.
 */
const PCT_TOLERANCE_DIGITS = 3;
const DEGENERATE_PCT_TOLERANCE_DIGITS = 1;

/** Une lane minimale : seuls les champs que la géométrie lit sont significatifs. */
function lane(overrides: Partial<AgentLane> = {}): AgentLane {
  return {
    agentId: 'agent-1',
    agentType: 'backend-dev',
    taskDescription: null,
    isMainSession: false,
    startedAt: new Date(NOW - 5 * MINUTE).toISOString(),
    endedAt: null,
    durationMs: 0,
    messages: 0,
    billableTokens: 0,
    cacheReadTokens: 0,
    costUsd: null,
    model: 'claude-opus-5',
    spawnDepth: 1,
    eventCount: 0,
    toolCallCount: 0,
    avgGapMs: 0,
    density: { firstBucket: 0, buckets: [] },
    ...overrides,
  };
}

describe('fenêtre vivante', () => {
  it('livingWindow_places_now_at_marker', () => {
    for (const spanMs of [10 * MINUTE, 30 * MINUTE]) {
      const window = TimelineDomain.livingWindow(NOW, spanMs);
      const pct = TimelineDomain.nowMarkerPct(window, NOW);

      expect(pct).not.toBeNull();
      expect(pct!).toBeCloseTo(TimelineDomain.NOW_MARKER_PCT, PCT_TOLERANCE_DIGITS);
    }

    // Cas dégénéré : à une seconde de portée, la milliseconde perdue à
    // l'arrondi pèse enfin quelque chose — trois centièmes de pourcent.
    const tiny = TimelineDomain.livingWindow(NOW, 1_000);
    expect(TimelineDomain.nowMarkerPct(tiny, NOW)!).toBeCloseTo(
      TimelineDomain.NOW_MARKER_PCT,
      DEGENERATE_PCT_TOLERANCE_DIGITS,
    );
  });

  it('livingWindow_spans_requested_range', () => {
    const window = TimelineDomain.livingWindow(NOW, 10 * MINUTE);

    // Le passé visible vaut exactement la plage demandée — jamais l'union du
    // contenu, qui produisait 18 h d'axe pour une minute de données.
    expect(NOW - Date.parse(window.since)).toBe(10 * MINUTE);

    // Et la marge de futur complète les 100 % au prorata du repère, à la
    // milliseconde d'arrondi près.
    const total = Date.parse(window.until) - Date.parse(window.since);
    expect(Math.abs(total - (10 * MINUTE * 100) / TimelineDomain.NOW_MARKER_PCT)).toBeLessThanOrEqual(1);
  });

  it('now_marker_absent_outside_window', () => {
    const archived = {
      since: new Date(NOW - 3 * 3600_000).toISOString(),
      until: new Date(NOW - 2 * 3600_000).toISOString(),
    };

    expect(TimelineDomain.nowMarkerPct(archived, NOW)).toBeNull();
  });
});

describe('position des barres', () => {
  const window = TimelineDomain.livingWindow(NOW, 10 * MINUTE);

  it('ongoing_lane_stops_at_now_marker', () => {
    const ongoing = lane({ startedAt: new Date(NOW - 5 * MINUTE).toISOString(), endedAt: null });
    const { leftPct, widthPct } = TimelineDomain.barPosition(ongoing, window, NOW);

    // Elle démarre à la moitié du passé visible…
    expect(leftPct).toBeCloseTo(TimelineDomain.NOW_MARKER_PCT / 2, PCT_TOLERANCE_DIGITS);
    // …et s'arrête au repère, pas au bord droit : les derniers pourcents sont
    // du futur, une barre qui les couvrirait mentirait.
    expect(leftPct + widthPct).toBeCloseTo(TimelineDomain.NOW_MARKER_PCT, PCT_TOLERANCE_DIGITS);
  });

  it('bar_position_clips_to_window', () => {
    const before = lane({
      startedAt: new Date(NOW - 30 * MINUTE).toISOString(),
      endedAt: new Date(NOW - 20 * MINUTE).toISOString(),
    });
    expect(TimelineDomain.barPosition(before, window, NOW).widthPct).toBe(0);

    const straddling = lane({
      startedAt: new Date(NOW - 30 * MINUTE).toISOString(),
      endedAt: new Date(NOW - 5 * MINUTE).toISOString(),
    });
    const clipped = TimelineDomain.barPosition(straddling, window, NOW);
    expect(clipped.leftPct).toBe(0);
    expect(clipped.widthPct).toBeCloseTo(TimelineDomain.NOW_MARKER_PCT / 2, PCT_TOLERANCE_DIGITS);
  });
});

describe('texture de densité', () => {
  it('density_cells_align_with_the_clipped_bar', () => {
    const window = TimelineDomain.livingWindow(NOW, 10 * MINUTE);
    const grid = { bucketMs: MINUTE };
    // La grille est ancrée trente minutes en arrière : les buckets 20 à 29
    // couvrent donc exactement les dix dernières minutes.
    const contentSince = new Date(NOW - 30 * MINUTE).toISOString();

    // Une lane commencée bien avant la fenêtre : la barre est coupée au bord
    // gauche, la texture doit l'être aussi.
    const long = lane({
      startedAt: new Date(NOW - 30 * MINUTE).toISOString(),
      endedAt: null,
      density: { firstBucket: 20, buckets: [1, 0, 0, 0, 0, 0, 0, 0, 0, 4] },
    });

    const cells = TimelineDomain.densityCells(long, window, grid, contentSince, 4, NOW);

    // Le bucket qui commence à l'instant même du bord gauche est à 0 %…
    expect(cells[0].leftPct).toBeCloseTo(0, PCT_TOLERANCE_DIGITS);
    // …et le dernier, celui de la minute écoulée, touche le repère, c'est-à-dire
    // 100 % de la barre visible. Sans la correction du plan 007 il serait à un
    // tiers de la barre, désignant une heure fausse.
    const last = cells[cells.length - 1];
    expect(last.leftPct + last.widthPct).toBeCloseTo(100, PCT_TOLERANCE_DIGITS);
    // Dix buckets d'une minute sur dix minutes visibles : chacun vaut 10 %.
    for (const cell of cells) expect(cell.widthPct).toBeCloseTo(10, PCT_TOLERANCE_DIGITS);
  });
});

describe('graduations', () => {
  it('axis_ticks_land_on_round_instants', () => {
    const window = TimelineDomain.livingWindow(NOW, 10 * MINUTE);
    const ticks = TimelineDomain.axisTicks(window);

    expect(ticks.length).toBeGreaterThan(2);

    // Un pas rond, identique entre deux graduations consécutives, et des
    // instants multiples de ce pas depuis l'epoch.
    const stepMs = ticks[1].key - ticks[0].key;
    expect([60_000, 120_000, 300_000]).toContain(stepMs);
    for (const tick of ticks) {
      expect(tick.key % stepMs).toBe(0);
      expect(tick.pct).toBeGreaterThanOrEqual(0);
      expect(tick.pct).toBeLessThanOrEqual(100);
    }

    // Le pas s'adapte : trente fois plus large ne veut pas dire trente fois
    // plus de traits.
    const wide = TimelineDomain.axisTicks(TimelineDomain.livingWindow(NOW, 300 * MINUTE));
    expect(wide[1].key - wide[0].key).toBeGreaterThan(stepMs);
    expect(wide.length).toBeLessThanOrEqual(40);
  });
});

describe('lisibilité des sous-agents', () => {
  it('peak_parallelism_counts_overlapping_subagents', () => {
    const lanes = [
      lane({ agentId: 'main', agentType: null, isMainSession: true, spawnDepth: null }),
      // Deux qui se chevauchent…
      lane({
        agentId: 'a',
        startedAt: new Date(NOW - 9 * MINUTE).toISOString(),
        endedAt: new Date(NOW - 5 * MINUTE).toISOString(),
      }),
      lane({
        agentId: 'b',
        startedAt: new Date(NOW - 7 * MINUTE).toISOString(),
        endedAt: new Date(NOW - 3 * MINUTE).toISOString(),
      }),
      // …et un troisième qui prend la suite sans recouvrement.
      lane({
        agentId: 'c',
        startedAt: new Date(NOW - 3 * MINUTE).toISOString(),
        endedAt: new Date(NOW - 1 * MINUTE).toISOString(),
      }),
    ];

    expect(TimelineDomain.peakParallelism(lanes, NOW)).toBe(2);

    // La session principale n'est pas une délégation : elle ne compte pas.
    expect(TimelineDomain.subagentLanes(lanes)).toHaveLength(3);
    expect(TimelineDomain.peakParallelism([lanes[0]], NOW)).toBe(0);
  });

  it('lane_indent_follows_spawn_depth', () => {
    expect(
      TimelineDomain.laneIndentDepth(lane({ isMainSession: true, spawnDepth: null })),
    ).toBe(0);
    expect(TimelineDomain.laneIndentDepth(lane({ spawnDepth: 1 }))).toBe(1);
    expect(TimelineDomain.laneIndentDepth(lane({ spawnDepth: 2 }))).toBe(2);
    // Un serveur muet ne doit pas aplatir un sous-agent sur sa session mère.
    expect(TimelineDomain.laneIndentDepth(lane({ spawnDepth: null }))).toBe(1);
  });

  it('selection_token_is_qualified_by_session', () => {
    const token = TimelineDomain.selectionToken('session-A', 'main');

    // C'est le correctif : « main » sélectionné dans A ne désigne rien dans B,
    // là où un identifiant nu ouvrait la piste dans toutes les sessions.
    expect(TimelineDomain.agentIdFromToken(token, 'session-A')).toBe('main');
    expect(TimelineDomain.agentIdFromToken(token, 'session-B')).toBeNull();
    expect(TimelineDomain.agentIdFromToken(null, 'session-A')).toBeNull();
  });
});
