# Plan 001 — Control Plane : baseline d'observabilité BUILD TIME

## Pourquoi

Pilier 1 du framework agentique BUILD TIME. Aujourd'hui la boucle `/groom → /plan → /build-* → /ship` tourne **sans aucune mesure** : impossible de dire si un sous-agent coûte moins qu'une session principale, quel outil échoue, ou ce que consomme réellement un cycle. Ce projet est la **baseline** qui rendra ces questions décidables.

> On ne peut améliorer que ce qu'on mesure. · Deterministic shell around probabilistic core.

Inspiration : `disler/claude-code-hooks-multi-agent-observability`, dont on reprend **l'idée** (pipeline events → store → SPA temps réel) mais pas l'implémentation : les hooks Claude Code savent désormais faire `"type": "http"` + `"async": true`, ce qui supprime les 12 scripts Python et la dépendance à Bun/uv.

## Décisions d'architecture (tranchées, ne pas rouvrir)

| Sujet | Décision | Raison |
|---|---|---|
| Transport | Hook natif `"type": "http"`, `"async": true`, `timeout: 2` | Zéro script, zéro toolchain supplémentaire, zéro latence sur la boucle |
| Backend | .NET 10 minimal API, conventions `dotnet-clean-arch` | Sa stack ; le Control Plane doit ressembler à ce qu'il vend |
| Persistance | **EF Core + SQLite** (fichier local), migrations au démarrage | Écart assumé au PostgreSQL habituel : un outil localhost ne doit pas exiger un conteneur pour démarrer. Convention `UseSnakeCaseNamingConvention()` conservée |
| Temps réel | WebSocket natif ASP.NET (`/stream`) | Une dépendance de moins que SignalR pour un broadcast unidirectionnel |
| Frontend | React + Vite + TS + Tailwind + shadcn/ui, conventions `react-feature-arch` | Sa stack |
| Router | **Aucun** (page unique) | KISS explicite — TanStack Router quand il y aura une 2ᵉ page |
| Auth / multi-tenancy | **Aucune** | localhost, mono-utilisateur. Ne pas introduire Clerk ni query filters |
| Domain events | **Aucun** dispatcher | Rien n'y souscrirait — abstraction spéculative |
| Port | `4317` — API + WS + SPA servi en statique, un seul process | Un seul `dotnet run` à lancer pour observer |

## Structure de solution (déjà scaffoldée par la session principale)

```
src/
  ControlPlane.Domain/          # HookEvent, HookEventErrors, EventProjection (pur). Aucune dép.
  ControlPlane.Application/     # Abstractions/Messaging (mediator maison), use cases. Dép : Domain
  ControlPlane.Infrastructure/  # EF Core DbContext + configs + migrations. Dép : Application, Domain
  ControlPlane.Api/             # IEndpoint auto-enregistrés, DI, WebSocket, wwwroot. Dép : toutes
  control-plane-ui/             # React/Vite
```

`Result` / `Error` / `ErrorType` vivent dans `ControlPlane.Domain/Abstractions/` — pas de 5ᵉ projet SharedKernel pour une solution mono-domaine.

## Modèle

`HookEvent` — un événement de cycle de vie, immuable, jamais modifié après ingestion.

Le **JSON brut est la source de vérité** ; les colonnes typées ne sont qu'un index de commodité, pour qu'un champ ajouté en amont par Claude Code reste exploitable sans migration.

| Colonne | Source dans le payload |
|---|---|
| `event_name` | `hook_event_name` |
| `session_id`, `prompt_id`, `cwd` | idem |
| `project` | feuille de `cwd` |
| `agent_id`, `agent_type` | idem — **null = session principale** |
| `tool_name`, `tool_use_id` | idem |
| `duration_ms` | `execution_time_ms` ou `batch_execution_time_ms` |
| `input_tokens`, `output_tokens` | `tokens_used.input` / `.output` |
| `cache_creation_tokens`, `cache_read_tokens` | `cache_creation_input_tokens` / `cache_read_input_tokens` |
| `stop_reason` | idem |
| `error` | `tool_error` ‖ `error_message` ‖ `denial_reason` ‖ `permission_reason` |
| `permission_mode`, `effort` | `permission_mode`, `effort.level` |
| `source` | `source` ‖ `trigger` ‖ `end_reason` ‖ `notification_type` ‖ `error_type` |
| `payload` | JSON brut, **tronqué à 32 Ko** |

**Troncature obligatoire** : un `PostToolUse` sur un `Read` de 2 000 lignes embarque tout le fichier dans `tool_response`. Au-delà de 32 Ko, tronquer et marquer `payload_truncated = true`.

**Robustesse d'ingestion** : ne jamais rejeter un payload. Champ absent ou d'un type inattendu → colonne à `null`. On instrumente un outil qui bouge vite ; une ingestion qui échoue est une mesure perdue.

## Contrat d'API (figé — le front peut être construit en parallèle)

```
POST /events                → 202, corps vide. Accepte n'importe quel JSON.
GET  /api/events            → { items: EventListItem[], nextBefore: number|null }
     ?limit=200&before=<id>&sessionId=&project=&eventName=&agentType=&toolName=
GET  /api/events/{id}       → EventDetail  (= EventListItem + payload, payloadTruncated)
GET  /api/filter-options    → { projects, sessions: [{id,project,startedAt,eventCount}], eventNames, agentTypes, toolNames }
GET  /api/stats?since=<ISO> → StatsResponse
WS   /stream                → { type: "event", data: EventListItem }
```

`EventListItem` = toutes les colonnes typées ci-dessus, en camelCase, **sans** `payload`.

`StatsResponse` — les 4 KPI de la baseline :

```jsonc
{
  "window": { "since": "…", "until": "…" },
  "totals": { "events": 0, "sessions": 0, "billableTokens": 0, "cacheReadTokens": 0, "cacheHitRatio": 0.0 },

  // KPI 1 — le coût réel de la délégation. agentType null = session principale.
  "tokensByAgent": [{ "agentType": null, "events": 0, "billableTokens": 0, "share": 0.0 }],

  // KPI 2 — success must be earned.
  "toolReliability": [{ "toolName": "Bash", "calls": 0, "failures": 0, "failureRate": 0.0,
                        "p50DurationMs": 0, "p95DurationMs": 0 }],

  // KPI 3 — saturation du contexte.
  "contextPressure": { "autoCompactions": 0, "manualCompactions": 0, "sessionsAffected": 0 },

  // KPI 4 — frottement de la boucle.
  "permissions": { "requested": 0, "denied": 0 },

  // KPI 5 — occupation du contexte et modèle, par session vivante.
  "sessions": [{
    "sessionId": "…", "project": "…", "model": null, "lastSeenAt": "…",
    "contextTokens": 0, "events": 0, "billableTokens": 0
  }]
}
```

### Contexte et modèle — dérivés, pas fournis

Aucun hook n'expose directement l'occupation du contexte ni le modèle courant. Les deux se reconstituent :

- **Occupation du contexte** = `input_tokens + cache_read_tokens + cache_creation_tokens` du **dernier** événement porteur de `tokens_used` de la session (`Stop`, `PostToolUse`, `SubagentStop`). Les tokens d'entrée d'un appel *sont* le contexte envoyé au modèle : la jauge est donc exacte, et gratuite. Le rapprocher des `PreCompact` donne le seuil réel de saturation observé.
- **Modèle** = champ `model` de `SessionStart` (optionnel), propagé à toute la session par jointure sur `session_id`. S'il est absent, il reste récupérable dans le JSONL pointé par `transcript_path`, présent sur chaque événement — à ne faire que si le champ manque réellement en pratique.

Conséquence : `contextTokens` et `model` sont des colonnes **calculées à la lecture**, jamais stockées sur l'événement.

`billableTokens` = `input + output + cache_creation`. Le cache **lu** est suivi à part : il n'est pas au même prix, et l'agréger écraserait le signal.

## Slices

**Slice 1 — Ingestion (backend).** `HookEvent` + `EventProjection` (Domain, pur, testable) · `RecordHookEventCommand` + handler (Application) · `ControlPlaneDbContext` + config + migration au démarrage (Infrastructure) · endpoint `POST /events` (Api). Critère : un `curl` d'un payload de hook réel atterrit en base avec ses colonnes projetées.

**Slice 2 — Lecture (backend).** `GetEventsQuery` (filtres + pagination keyset sur `id`), `GetEventByIdQuery`, `GetFilterOptionsQuery` + endpoints. Critère : les 3 endpoints répondent avec les filtres combinés.

**Slice 3 — KPI (backend).** `GetStatsQuery` + handler produisant `StatsResponse`, endpoint `GET /api/stats`. Percentiles calculés en SQL. Critère : les 4 KPI se calculent sur des données réelles.

**Slice 4 — Temps réel (backend).** `IEventBroadcaster` (Application) + implémentation WebSocket (Api), diffusion depuis le handler d'ingestion. Critère : deux navigateurs reçoivent le même événement en direct.

**Slice 5 — Feature `observability` (frontend).** `api/` repository, `application/` service `Result`, `domain/` règles pures (couleur par session, emoji par outil, formatage tokens), `hooks/` TanStack Query + hook WebSocket, `components/` timeline filtrable. Store Zustand pour les filtres uniquement — l'état serveur reste dans React Query.

**Slice 6 — Tableau de bord KPI (frontend).** Tuiles des 4 KPI + répartition session principale vs sous-agents. Construit sur `components/vloc/`.

**Slice 7 — Câblage (session principale).** Hooks dans `~/.claude/settings.json`, README, script de lancement.

## Vérification de bout en bout

1. `dotnet run` → `http://localhost:4317` répond.
2. `curl -X POST /events` avec un payload `PostToolUse` réel copié de la doc → 202, ligne en base, colonnes projetées correctement.
3. Hooks câblés → ouvrir une session Claude Code dans un autre projet, lancer quelques outils → les événements apparaissent **en direct** dans l'UI.
4. Lancer un `Explore` ou un `backend-dev` → un `SubagentStop` arrive avec `agent_type` et `tokens_used` → la tuile « coût par agent » se remplit.
5. Couper le serveur, continuer à travailler dans Claude Code → **la session n'est ni ralentie ni bloquée** (c'est le test qui compte le plus : l'observabilité ne doit jamais devenir un point de défaillance de la boucle).
