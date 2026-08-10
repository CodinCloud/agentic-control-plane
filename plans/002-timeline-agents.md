# Spec 002 — Timeline des agents (Gantt d'observation)

> **Statut : décidé.** Issue d'un `/groom` du 2026-08-10. Prêt pour `/plan`.

## Pourquoi

Le Control Plane sait aujourd'hui *combien* consomment les agents, pas *quand ni pendant combien de temps*. Or les données montrent des chevauchements réels — `backend-dev a589` et `frontend-dev ae05` ont tourné en parallèle de 09:52 à 10:04 — invisibles dans un tableau.

**Objectif : un instrument de pilotage**, pas un rapport d'autopsie. Voir sur quoi travaille chaque agent pendant qu'il travaille, combien il coûte, et ce qu'on lui a demandé.

## Décisions tranchées

| # | Décision | Rationale |
|---|---|---|
| 1 | **Une lane par agent**, pas par type | Une lane par type ancrerait la topologie *spécifier/produire/vérifier/capitaliser* dans l'outil et le rendrait intransmissible. Par agent = générique, réutilisable sur n'importe quelle configuration |
| 2 | **Largeur = durée · épaisseur = tokens** | Deux dimensions géométriques indépendantes, lisibles ensemble sans ambiguïté. Un agent court et gourmand devient un bloc épais et étroit, repérable d'un coup d'œil. Le libellé se place **à côté** de la barre, jamais dedans — « 31 220 tk » ne tient pas dans 8 pixels |
| 3 | **Échelle linéaire + sélecteur de plage** | L'axe reste honnête : proportions et chevauchements vrais. Un agent de 2 min pèse 1,3 % d'une session de 2 h 33, donc la lisibilité vient du cadrage, pas d'une déformation de l'axe |
| 4 | **Temps réel** — barre ouverte qui s'étend | C'est ce qui fait la différence entre piloter et constater. Le WebSocket existe déjà |
| 5 | **Composant fait maison**, pas ReUI ni shadcn.io | Ces Gantt vont de l'échelle *jour* à *année* — nous sommes à la minute, facteur ~1000. Ils embarquent glisser-déposer, CRUD, validation de dépôt, édition : inutile en lecture seule. Des rectangles positionnés en pourcentage suffisent |
| 6 | **Bornes = min/max des `timestamp_utc` de `model_usages`** | Les hooks `Subagent*` sont **non fiables** : 1 `SubagentStart` et 4 `SubagentStop` captés pour 7 agents réellement lancés. Approximation assumée : l'agent naît un peu avant son premier message et meurt un peu après le dernier |
| 7 | **Détail au clic** : brief, rapport, tokens, modèle | Vérifié récupérable — premier message `user` = le brief de spawn, dernier `assistant` = le rapport. Nécessite d'étendre l'ingestion du transcript |

## Périmètre

**Dans le périmètre**
- Endpoint `GET /api/timeline?sessionId=&since=` → lanes + barres.
- Extension de l'ingestion transcript : capturer `brief` et `report` par agent.
- Composant Gantt en lecture seule, une lane par agent, temps réel via le flux existant.
- Sélecteur de plage : session entière · dernière heure · dernier tour.
- Panneau de détail au clic sur une barre.

**Hors périmètre**
- Glisser-déposer, édition, dépendances entre tâches, export — c'est un instrument de mesure, pas un outil de planification.
- Zoom continu à la molette : le sélecteur de plage suffit tant qu'il n'a pas prouvé le contraire.
- La lane de la session principale couvre toute la durée : affichée en **bandeau de référence** au-dessus des lanes d'agents, pas comme une lane parmi d'autres.

## Definition of Done

Chaque critère porte son oracle — *un critère sans oracle est un vœu*.

| # | Critère | Oracle |
|---|---|---|
| 1 | `GET /api/timeline` répond 200 avec une lane par agent distinct de la fenêtre | Test de contrat : 8 lanes attendues sur le jeu réel du 2026-08-10 |
| 2 | Chaque barre porte `agentId`, `agentType`, `taskDescription`, `startedAt`, `endedAt`, `billableTokens` | Test de contrat sur les noms de champs servis — *le défaut `receivedAtUtc` / `receivedAt` ne se reproduit pas* |
| 3 | Les chevauchements réels apparaissent | Test : `a589` (09:51:55→10:04:45) et `ae05` (09:52:14→10:08:12) se recouvrent |
| 4 | Une barre ouverte (agent en cours) est distinguable d'une barre close | `endedAt` nul ⇒ rendu distinct |
| 5 | Un agent en cours apparaît sans rechargement | Jugement humain — lancer un agent, regarder l'écran |
| 6 | L'épaisseur est proportionnelle aux tokens, bornée min/max | Jugement humain — comparer deux barres connues |
| 7 | Le clic ouvre brief et rapport | Test : le brief de `a02b33b1` commence par « Trois corrections sur » |

## Contrat d'API (figé — permet de paralléliser back et front)

```
GET /api/timeline?sessionId=&since=   → TimelineResponse
GET /api/timeline/agents/{agentId}    → AgentRunDetail (brief + report)
WS  /stream                            → inchangé, sert de signal de rafraîchissement
```

```jsonc
// TimelineResponse
{
  "window": { "since": "2026-08-10T09:31:21Z", "until": "2026-08-10T12:04:39Z" },
  "mainSession": {                       // bandeau de référence, pas une lane
    "sessionId": "529ee67d-…", "model": "claude-opus-5",
    "startedAt": "…", "endedAt": null,   // null = en cours
    "messages": 156, "billableTokens": 560820
  },
  "lanes": [{
    "agentId": "agent-a589e16d",
    "agentType": "backend-dev",
    "taskDescription": "Backend slice 1 — ingestion",
    "startedAt": "2026-08-10T09:51:55Z",
    "endedAt": "2026-08-10T10:04:45Z",   // null = agent en cours
    "durationMs": 770000,
    "messages": 35,
    "billableTokens": 215416,
    "cacheReadTokens": 6799211,
    "model": "claude-opus-5",
    "spawnDepth": 1
  }]
}

// AgentRunDetail = une lane + :
{ "brief": "…", "report": "…", "briefTruncated": false, "reportTruncated": false }
```

`lanes` triées par `startedAt` croissant. Un agent est **en cours** si son dernier message date de moins de 2 minutes et qu'aucun `SubagentStop` ne le clôt.

## Slices

| # | Stack | Contenu | Dépend de |
|---|---|---|---|
| **1** | backend `.cs` | Capture `brief` (premier message `user`) et `report` (dernier message `assistant`) par agent, tronqués à 8 Ko. Entité ou projection `AgentRun`. Endpoints `/api/timeline` et `/api/timeline/agents/{id}`. | — |
| **2** | frontend `.tsx` | Composant Gantt lecture seule : lanes, largeur = durée, épaisseur = tokens, bandeau session principale, sélecteur de plage. | contrat figé |
| **3** | frontend `.tsx` | Temps réel (barre ouverte qui s'étend) + panneau de détail au clic (brief / rapport / tokens / modèle). | slice 2 |

Slices 1 et 2 **parallélisables** — fichiers disjoints, contrat figé ci-dessus.

## Risques ouverts

- **Approximation des bornes** : la durée mesurée exclut le démarrage et l'arrêt de l'agent. Écart probablement de quelques secondes, non mesuré. Acceptable pour du pilotage, à ne pas présenter comme une durée exacte.
- **Volume de lanes** : 8 agents tiennent à l'écran, 30 non. Aucun défilement vertical spécifique prévu pour l'instant — à traiter quand le cas se présentera, pas avant.
- **Taille du brief et du rapport** : certains briefs font plusieurs milliers de caractères. Tronquer au stockage, comme le payload des hooks.
