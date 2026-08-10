# Spec 003 — Timeline multi-sessions

> Objectif : un monitoring qui s'attache à **toutes** les sessions Claude Code, pas à une seule.

## Pourquoi

Le backend résout « la session la plus récemment active » et n'en affiche qu'une. Conséquence observée le 2026-08-10 : après un `/compact`, Claude Code ouvre une **nouvelle session** ; la timeline bascule dessus et 13 agents de travail disparaissent de l'écran alors qu'ils sont en base.

Le cas est structurel, pas accidentel : un compactage, un `/clear`, ou simplement deux fenêtres Claude Code ouvertes en parallèle produisent plusieurs sessions simultanées. Un plan de contrôle qui n'en voit qu'une est aveugle à son propre périmètre.

Aucun identifiant n'est codé en dur — vérifié. Le défaut est dans la forme du contrat, pas dans une valeur figée.

## Contrat d'API (figé)

```
GET /api/timeline?sessionId=&since=
```

`sessionId` devient un **filtre optionnel**. Absent : toutes les sessions de la fenêtre.

```jsonc
{
  "window": { "since": "…", "until": "…", "lastTurnStartedAt": "…" },
  "sessions": [{
    "sessionId": "dad01096-…",
    "project": "learning-framework",
    "model": "claude-opus-5",
    "startedAt": "…", "endedAt": null,      // null = session vivante
    "messages": 19,
    "billableTokens": 538200,
    "isActive": true,                        // dernière activité < 5 min
    "lanes": [ /* inchangé : agentId, agentType, taskDescription,
                  startedAt, endedAt, durationMs, messages,
                  billableTokens, cacheReadTokens, model, spawnDepth */ ]
  }]
}
```

`mainSession` disparaît, remplacé par `sessions[]`. Tri : activité la plus récente d'abord. Une session sans agent apparaît quand même — son bandeau seul est une information.

`GET /api/timeline/agents/{agentId}` : inchangé.

## Décisions

| # | Décision | Rationale |
|---|---|---|
| 1 | Toutes les sessions par défaut | C'est l'objectif : voir ce qui tourne, pas ce qui tournait dans une session élue |
| 2 | `isActive` = dernière activité < 5 min | Distinguer ce qui vit de ce qui est archivé, sans inventer un état que les hooks ne fournissent pas |
| 3 | Une session sans agent reste affichée | Son absence d'agents est elle-même une mesure |
| 4 | L'axe de temps reste **commun** à toutes les sessions | Deux sessions parallèles doivent être comparables à l'œil : c'est tout l'intérêt |

## Definition of Done

| # | Critère | Oracle |
|---|---|---|
| 1 | `GET /api/timeline` sans paramètre retourne ≥ 2 sessions sur les données actuelles | Test de contrat : `dad01096` et `529ee67d` présentes |
| 2 | `529ee67d` porte ses 13 lanes | Test de contrat |
| 3 | Filtrer par `sessionId` ne retourne que celle-là | Test de contrat |
| 4 | Une session vivante est marquée `isActive` | Test de contrat sur la session courante |
| 5 | L'écran montre les deux sessions, axe partagé | Jugement humain |
| 6 | Un sélecteur permet d'isoler une session | Jugement humain |

## Hors périmètre

Regroupement par projet, archivage, suppression de sessions. Un sélecteur et un tri suffisent tant que le nombre de sessions reste petit.
