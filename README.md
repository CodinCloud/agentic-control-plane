# Agentic Control Plane

Observabilité locale de la boucle de développement agentique — **BUILD TIME**.

Claude Code et ses sous-agents travaillent en boîte noire : on ne sait ni combien de temps un sous-agent a réellement tourné, ni ce qu'il a coûté, ni ce qu'il a fait pendant ce temps. Cet outil branche un plan de contrôle sur le cycle de vie de l'agent et rend une question décidable :

> **Déléguer à un sous-agent scopé coûte-t-il moins cher que de tout faire dans la session principale ?**

Tout le reste est subordonné à ça. Ce n'est pas un tableau de bord d'infrastructure, pas un outil d'équipe, pas un produit : c'est un instrument de mesure braqué sur une seule boucle de travail.

> On ne peut améliorer que ce qu'on mesure. · *Deterministic shell around probabilistic core.*

Inspiré de [`disler/claude-code-hooks-multi-agent-observability`](https://github.com/disler/claude-code-hooks-multi-agent-observability), dont on reprend l'idée — pipeline événements → store → SPA temps réel — mais pas l'implémentation : les hooks Claude Code savent désormais faire `"type": "http"` et `"async": true`, ce qui supprime les scripts intermédiaires et toute dépendance à Python/uv/Bun.

## Ce que ça montre

**Une métrique n'a sa place à l'écran que si elle change une décision sur le workflow.** L'écran d'un outil d'observabilité est une ressource rare ; un compteur qu'on regarde sans savoir quoi en faire dilue ceux qui comptent. Trois choses ont survécu à cet arbitrage :

| Quoi | Question à laquelle il répond |
|---|---|
| **Chronologie des agents** (Gantt) | Qui a tourné, quand, combien de temps, en parallèle de quoi, et *avec quels outils*. C'est ce qui rend la forme réelle d'une boucle agentique visible — donc critiquable. |
| **Coût équivalent API** | Un sous-agent scopé coûte-t-il moins que la session principale, ou le multi-agent fait-il exploser la facture pour rien ? Chiffré en dollars, par compartiment de tokens et par modèle. |
| **Flux d'événements** | Le brut, sous la chronologie. Sert au diagnostic quand un agent se comporte bizarrement, pas au pilotage quotidien. |

Fiabilité des outils, pression sur le contexte et frottement des permissions ont été **retirés de l'écran** le 2026-08-10 : aucun n'avait jamais déclenché de décision. Ils restent calculés et exposés par `GET /api/stats` — la donnée continue d'être collectée, seul l'affichage disparaît. Voir `CONTEXT.md` §« Doctrine des KPI ».

> Le montant affiché n'est **pas une facture** : le poste travaille sous abonnement forfaitaire. C'est la valorisation du travail aux tarifs API publics — *combien ce travail aurait coûté en pay-per-token*. L'UI dit « équivalent API », jamais « dépense ».

## Deux écrans

| Route | Usage | Fraîcheur |
|---|---|---|
| `/` | **Tour de contrôle** — ce qui tourne maintenant. Fenêtre glissante, repère « maintenant » fixe, sessions actives, aucun montant. | WebSocket |
| `/sessions` | Liste des sessions, triée par activité récente. Point d'entrée de l'analyse. | REST |
| `/sessions/$sessionId` | **Analyse** d'une session terminée — le Gantt de cette session *plus* le coût par agent. | REST |

Surveiller et disséquer sont deux usages, deux rythmes, deux questions. Le Gantt est le même composant, paramétré : ce qui distingue les écrans est la fraîcheur, la portée et le coût, pas la mécanique.

## Architecture

Deux chemins d'ingestion, pas un — et c'est la subtilité centrale du système :

```
                     ┌── hook "http" async ──> POST /events ──> HookEvent ──┬──> SQLite
Claude Code ─────────┤                                                      │
                     └── Stop / SubagentStop ─────────┐                     └──> WebSocket /stream ──> SPA
                                                      ▼
                                        file d'ingestion (hors requête)
                                                      ▼
                                    lecture du transcript JSONL ──> ModelUsage + AgentRun ──> SQLite
```

**Les tokens ne sont sur aucun payload de hook.** Ils sont reconstruits en relisant le transcript JSONL de la session, mais seulement sur `Stop`/`SubagentStop` — le relire à chaque appel d'outil serait ruineux. Conséquence à connaître : les événements arrivent en continu, les tokens par tour. Le « quand » et le « combien » n'ont pas la même horloge.

L'ingestion du transcript tourne **hors du chemin de requête** : lire un transcript, aussi gros soit-il, ne peut jamais ralentir ni faire échouer un `POST /events`. L'idempotence est portée par `ModelUsage.MessageId`, ce qui rend inoffensive la relecture du fichier depuis le début à chaque tour.

Un seul processus, un seul port : l'API encaisse, stocke, diffuse **et** sert le SPA.

| Couche | Techno |
|---|---|
| Backend | .NET 10, minimal API, mediator maison, `Result`/`Error` |
| Persistance | EF Core + SQLite (fichier local), migrations au démarrage |
| Temps réel | WebSocket natif ASP.NET |
| Frontend | React 19, Vite, TypeScript, Tailwind v4, shadcn/ui, TanStack Query + Router, Zustand |
| Tests | xUnit sur le domaine — projections et tarification, fonctions pures |

Écarts assumés aux conventions habituelles : **SQLite plutôt que PostgreSQL**, et **aucune conteneurisation** — un outil d'observation locale ne doit pas exiger un conteneur pour démarrer, et celui-ci n'a pas vocation à sortir du poste.

## Lancer

```bash
# Backend + SPA compilé, sur http://localhost:4317
dotnet run --project src/ControlPlane.Api

# Frontend en développement (HMR, proxy vers 4317)
cd src/control-plane-ui && npm run dev

# Tests du domaine
dotnet test
```

## Brancher ses agents

Dans `~/.claude/settings.json` — le hook poste lui-même, aucun script n'est nécessaire :

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:4317/events",
            "async": true,
            "timeout": 2
          }
        ]
      }
    ]
  }
}
```

`"async": true` est la clé : le hook part en arrière-plan et n'ajoute aucune latence à la boucle. **Serveur éteint = sessions intactes** — l'observabilité ne doit jamais devenir un point de défaillance de ce qu'elle observe.

Il n'y a **aucune liste blanche à l'ingestion** : `EventProjection` lit `hook_event_name` génériquement. Ajouter un événement se fait donc entièrement dans `settings.json`, sans toucher au backend. La configuration complète des 16 événements captés est dans `hooks/claude-hooks.json`.

## Où lire la suite

`CONTEXT.md` porte la doctrine — pourquoi cet outil existe, quels KPI ont le droit d'être à l'écran, ce qu'on capte et ce qu'on écarte. Les décisions détaillées vivent dans `plans/`, un fichier par tranche :

| Spec | Sujet |
|---|---|
| `001-observability-baseline.md` | Événements captés, contrat d'API, pipeline hooks → store → SPA |
| `002-timeline-agents.md` | Cycle de vie des agents, tokenomique réelle, Gantt |
| `003-multi-sessions.md` | Toutes les sessions plutôt qu'une seule élue |
| `004-cout-equivalent-api.md` | Tokens → dollars, tarification par compartiment et par modèle |
| `005-gantt-exploitable.md` | Piste d'outils par agent, in/out extrait, séparation temps réel / analyse |
| `006-gantt-vivant.md` | La session principale comme lane, géométrie sur les événements, texture de densité |
| `007-timeline-live.md` | Fenêtre glissante ancrée sur « maintenant », défilement, filiation des sous-agents |
