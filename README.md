# Agentic Control Plane

Observabilité locale de la boucle de développement agentique — **BUILD TIME**.

Claude Code et ses sous-agents travaillent aujourd'hui en boîte noire : on ne sait ni ce qu'un sous-agent coûte réellement, ni quel outil échoue le plus, ni à quelle fréquence le contexte sature. Cet outil branche un plan de contrôle sur le cycle de vie de l'agent et rend ces questions décidables.

> On ne peut améliorer que ce qu'on mesure. · *Deterministic shell around probabilistic core.*

Inspiré de [`disler/claude-code-hooks-multi-agent-observability`](https://github.com/disler/claude-code-hooks-multi-agent-observability), dont on reprend l'idée — pipeline événements → store → SPA temps réel — mais pas l'implémentation : les hooks Claude Code savent désormais faire `"type": "http"` et `"async": true`, ce qui supprime les scripts intermédiaires et toute dépendance à Python/uv/Bun.

## Ce que ça mesure

| KPI | Question à laquelle il répond |
|---|---|
| **Coût par agent** | Un sous-agent scopé coûte-t-il moins que la session principale, ou le multi-agent fait-il exploser la facture pour rien ? |
| **Fiabilité des outils** | Quel outil échoue, combien de temps prend-il (p50/p95) ? — *success must be earned* |
| **Pression sur le contexte** | À quelle fréquence le contexte sature-t-il et se compacte-t-il ? |
| **Frottement des permissions** | Combien d'interruptions la boucle subit-elle ? |

## Architecture

```
Claude Code ──hook "http" async──> POST /events ──> SQLite
                                        │
                                        └── WebSocket /stream ──> SPA React
```

Un seul processus, un seul port : l'API encaisse, stocke, diffuse **et** sert le SPA.

| Couche | Techno |
|---|---|
| Backend | .NET 10, minimal API, mediator maison, `Result`/`Error` |
| Persistance | EF Core + SQLite (fichier local), migrations au démarrage |
| Temps réel | WebSocket natif ASP.NET |
| Frontend | React 19, Vite, TypeScript, Tailwind v4, shadcn/ui, TanStack Query, Zustand |

Écart assumé aux conventions habituelles : **SQLite plutôt que PostgreSQL**. Un outil d'observation locale ne doit pas exiger un conteneur pour démarrer.

## Lancer

```bash
# Backend + SPA compilé, sur http://localhost:4317
dotnet run --project src/ControlPlane.Api

# Frontend en développement (HMR, proxy vers 4317)
cd src/control-plane-ui && npm run dev
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

Voir `plans/001-observability-baseline.md` pour la liste complète des événements captés et le contrat d'API.
