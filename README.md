# Agentic Control Plane

Observabilité locale de la boucle de développement agentique.

Claude Code et ses sous-agents travaillent en boîte noire : on ne sait ni combien de temps un sous-agent a réellement tourné, ni ce qu'il a coûté, ni ce qu'il a fait pendant ce temps. Cet outil branche un plan de contrôle sur le cycle de vie de l'agent afin de rendre une question décidable :

> Déléguer à un sous-agent scopé coûte-t-il moins cher que de tout faire dans la session principale ?

C'est un instrument de mesure local, destiné à un poste de travail. Ni tableau de bord d'infrastructure, ni outil d'équipe.

Inspiré de [`disler/claude-code-hooks-multi-agent-observability`](https://github.com/disler/claude-code-hooks-multi-agent-observability), dont il reprend le principe — pipeline événements → store → SPA temps réel — mais pas l'implémentation : les hooks Claude Code savent désormais faire `"type": "http"` et `"async": true`, ce qui supprime les scripts intermédiaires et toute dépendance à Python, uv ou Bun.

## Démarrer

Prérequis : **.NET 10 SDK** et **Node.js 20+**.

```bash
dotnet run --project src/ControlPlane.Api
```

L'application est alors disponible sur **http://localhost:4317** — un seul processus et un seul port : l'API encaisse les événements, les stocke, les diffuse et sert le SPA.

Rien n'est à provisionner : la base SQLite (`control-plane.db`) est créée au démarrage et ses migrations sont appliquées automatiquement.

Le SPA est compilé au premier build, `wwwroot` n'étant pas versionné. Les builds suivants l'ignorent, pour ne pas ralentir la boucle backend. Pour le recompiler après une modification du front sans passer par le serveur de développement :

```bash
dotnet build src/ControlPlane.Api -p:BuildSpa=true
```

### Remplir l'écran sans attendre une vraie session

```powershell
./scripts/seed-sample-events.ps1
```

Le script envoie sur `/events` des événements dont la forme reproduit fidèlement celle des hooks Claude Code. Utile pour vérifier la chaîne complète avant de brancher le harnais sur de vraies sessions.

### Développer le front

Deux terminaux : l'API d'un côté, Vite de l'autre. Le serveur de développement assure le rechargement à chaud et relaie `/api` et `/stream` vers le port 4317.

```bash
dotnet run --project src/ControlPlane.Api
cd src/control-plane-ui && npm run dev
```

### Tests

```bash
dotnet test                            # domaine backend — projections, tarification
cd src/control-plane-ui && npm test    # domaine front — géométrie de la timeline
```

## Brancher Claude Code

Dans `~/.claude/settings.json`. Le hook poste lui-même : aucun script intermédiaire n'est nécessaire.

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

`"async": true` est déterminant : le hook part en arrière-plan et n'ajoute aucune latence à la boucle de travail. **Serveur éteint, sessions intactes** — l'observabilité ne doit jamais devenir un point de défaillance de ce qu'elle observe.

L'ingestion n'applique aucune liste blanche : `EventProjection` lit `hook_event_name` de façon générique. Ajouter un événement se fait donc entièrement dans `settings.json`, sans toucher au backend. La configuration complète des 16 événements captés est dans [`hooks/claude-hooks.json`](hooks/claude-hooks.json).

## Les écrans

| Route | Usage | Fraîcheur |
|---|---|---|
| `/` | **Tour de contrôle** — ce qui tourne maintenant. Fenêtre glissante, repère « maintenant » fixe, sessions actives. Aucun montant. | WebSocket |
| `/sessions` | Liste des sessions, triée par activité récente. Point d'entrée de l'analyse. | REST |
| `/sessions/$sessionId` | **Analyse** d'une session — sa chronologie complète et le coût par agent. | REST |

Surveiller et disséquer sont deux usages, deux rythmes, deux questions. La chronologie est le même composant, paramétré : ce qui distingue les écrans est la fraîcheur, la portée et le coût, non la mécanique.

## Ce que l'outil montre

| Élément | Question à laquelle il répond |
|---|---|
| **Chronologie des agents** | Qui a tourné, quand, combien de temps, en parallèle de quoi, et avec quels outils. C'est ce qui rend la forme réelle d'une boucle agentique visible, donc critiquable. |
| **Coût équivalent API** | Un sous-agent scopé coûte-t-il moins que la session principale, ou le multi-agent alourdit-il la facture sans contrepartie ? Chiffré en dollars, par compartiment de tokens et par modèle. |
| **Flux d'événements** | Le détail brut, sous la chronologie. Sert au diagnostic lorsqu'un agent se comporte de façon inattendue, non au pilotage quotidien. |

Une métrique n'a sa place à l'écran que si elle change une décision sur le workflow ; plusieurs ont été retirées à ce titre tout en restant calculées et exposées par `GET /api/stats`. Voir [`CONTEXT.md`](CONTEXT.md) § « Doctrine des KPI ».

> Le montant affiché n'est **pas une facture** : le poste travaille sous abonnement forfaitaire. C'est la valorisation du travail aux tarifs API publics — ce que ce travail aurait coûté en paiement à l'usage. L'interface dit « équivalent API », jamais « dépense ».

## Architecture

Deux chemins d'ingestion, et c'est la subtilité centrale du système :

```
                     ┌── hook "http" async ──> POST /events ──> HookEvent ──┬──> SQLite
Claude Code ─────────┤                                                      │
                     └── Stop / SubagentStop ─────────┐                     └──> WebSocket /stream ──> SPA
                                                      ▼
                                        file d'ingestion (hors requête)
                                                      ▼
                                    lecture du transcript JSONL ──> ModelUsage + AgentRun ──> SQLite
```

**Les tokens ne figurent sur aucun payload de hook.** Ils sont reconstruits en relisant le transcript JSONL de la session, mais seulement sur `Stop` et `SubagentStop` : le relire à chaque appel d'outil serait bien trop coûteux. Conséquence à connaître avant de déboguer un écran figé — les événements arrivent en continu, les tokens par tour. Le « quand » et le « combien » n'ont pas la même horloge.

L'ingestion du transcript s'exécute hors du chemin de requête : lire un transcript, aussi volumineux soit-il, ne peut ni ralentir ni faire échouer un `POST /events`. L'idempotence repose sur `ModelUsage.MessageId`, ce qui rend inoffensive la relecture du fichier depuis le début à chaque tour.

| Couche | Technologie |
|---|---|
| Backend | .NET 10, minimal API, mediator maison, `Result`/`Error` |
| Persistance | EF Core et SQLite (fichier local), migrations au démarrage |
| Temps réel | WebSocket natif ASP.NET |
| Frontend | React 19, Vite, TypeScript, Tailwind v4, shadcn/ui, TanStack Query et Router, Zustand |
| Tests | xUnit sur le domaine backend, Vitest sur le domaine frontend |

Deux écarts aux conventions habituelles, tous deux délibérés : **SQLite plutôt que PostgreSQL** et **aucune conteneurisation**. Un outil d'observation locale ne doit pas exiger un conteneur pour démarrer, et celui-ci n'a pas vocation à quitter le poste.

## Documentation

[`CONTEXT.md`](CONTEXT.md) porte la doctrine : pourquoi cet outil existe, quelles métriques ont le droit d'être à l'écran, ce qui est capté et ce qui est écarté. Les décisions détaillées vivent dans `plans/`, un fichier par tranche.

| Spec | Sujet |
|---|---|
| `001-observability-baseline.md` | Événements captés, contrat d'API, pipeline hooks → store → SPA |
| `002-timeline-agents.md` | Cycle de vie des agents, tokenomique réelle, chronologie |
| `003-multi-sessions.md` | Toutes les sessions plutôt qu'une seule élue |
| `004-cout-equivalent-api.md` | Tokens vers dollars, tarification par compartiment et par modèle |
| `005-gantt-exploitable.md` | Piste d'outils par agent, extraction des entrées/sorties, séparation temps réel et analyse |
| `006-gantt-vivant.md` | La session principale comme lane, géométrie sur les événements, texture de densité |
| `007-timeline-live.md` | Fenêtre glissante ancrée sur « maintenant », défilement, filiation des sous-agents |
