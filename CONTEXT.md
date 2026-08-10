# CONTEXT

## Ce qu'est cet outil

Un outil local de **monitoring et d'historisation de l'usage de Claude Code**, dont la finalité est de comprendre et d'améliorer un workflow **SDLC agentique** — la boucle `groom → plan → delegate → ship` et les sous-agents scopés qui l'exécutent.

Ce n'est pas un tableau de bord d'infrastructure, pas un outil d'équipe, pas un produit. C'est un instrument de mesure braqué sur une seule boucle de travail : celle de son auteur.

La question qu'il doit rendre décidable :

> **Déléguer à un sous-agent scopé coûte-t-il moins cher que de tout faire dans la session principale ?**

Tout le reste est subordonné à ça.

## Inspiration

[`disler/claude-code-hooks-multi-agent-observability`](https://github.com/disler/claude-code-hooks-multi-agent-observability) — dont on reprend l'idée (pipeline événements → store → SPA temps réel) mais pas l'implémentation. Les hooks Claude Code savent désormais faire `"type": "http"` et `"async": true`, ce qui supprime les scripts intermédiaires et toute dépendance à Python/uv/Bun.

## Doctrine des KPI

**Une métrique n'a sa place à l'écran que si elle change une décision sur le workflow.** Une métrique qu'on regarde sans savoir quoi en faire est du bruit qui dilue celles qui comptent — et l'écran d'un outil d'observabilité est une ressource rare.

### Ce qui reste

| Quoi | Pourquoi |
|---|---|
| **Chronologie des agents** (Gantt) | Le cœur de l'outil. Qui a tourné, quand, combien de temps, en parallèle de quoi. C'est ce qui rend la forme réelle d'une boucle agentique visible — et donc critiquable. |
| **Coût par agent** | La question centrale, chiffrée. Session principale contre chaque type de sous-agent. |
| **Flux d'événements** | Le brut, sous la chronologie. Sert au diagnostic quand un agent se comporte bizarrement, pas au pilotage quotidien. |

### Ce qui a été retiré le 2026-08-10

| Quoi | Pourquoi |
|---|---|
| Bandeau Événements / Sessions / Tokens facturables / Tokens cache lus / Taux de cache | Des compteurs, pas des KPI. Aucun n'a jamais déclenché la moindre décision. Un nombre d'événements élevé ne dit ni que ça va bien, ni que ça va mal. |
| Fiabilité des outils (taux d'échec, p50/p95) | Métrique illisible en pratique : le taux d'échec d'un outil ne dit rien d'actionnable sur *ma* façon de découper le travail. C'était une mesure d'infrastructure dans un outil qui parle de méthode. |
| Pression sur le contexte (compactions auto/manuelles) | Un compte de compactions n'oriente aucune décision de découpage tant qu'on ne sait pas *ce qui* a saturé le contexte. |
| Frottement des permissions (demandes/refus) | Idem — un compteur d'interruptions sans le contexte de ce qui a été interrompu. |

Ces trois derniers KPI restent **calculés côté backend** et exposés par `GET /api/stats` : la donnée continue d'être collectée, seul l'affichage disparaît. Le jour où l'un d'eux redevient une question, il ne reste qu'à le rebrancher.

## Ce qu'on capte

Liste confrontée à [la doc officielle](https://code.claude.com/docs/en/hooks) le **2026-08-10**. Elle recense **31 événements** ; on en capte **16**. Contrairement à ce qu'on soupçonnait, aucun nom câblé n'était périmé — tous existent.

Capter est bon marché (hook `async`, aucune latence ajoutée) et *un événement perdu l'est pour toujours* : le seuil d'inclusion est donc plus bas que celui d'affichage. Ce qui est capté n'a pas vocation à être montré.

**Captés** — cycle de vie de la session (`SessionStart`, `SessionEnd`), du tour (`UserPromptSubmit`, `UserPromptExpansion`, `Stop`, `StopFailure`), des outils (`PostToolUse`, `PostToolUseFailure`, `PostToolBatch`), des sous-agents (`SubagentStart`, `SubagentStop`), du contexte (`PreCompact`, `PostCompact`), des permissions (`PermissionRequest`, `PermissionDenied`) et `Notification`.

**Écartés délibérément :**

| Événement | Pourquoi |
|---|---|
| `PreToolUse` | Doublerait le volume sans rien apprendre que `PostToolUse` et `PostToolUseFailure` ne disent déjà. |
| `MessageDisplay` | Se déclenche pendant l'affichage du texte — volume énorme, valeur nulle pour une question de méthode. |
| `TaskCreated`, `TaskCompleted` | Redondants : `TaskCreate`/`TaskUpdate` arrivent déjà comme appels d'outil via `PostToolUse`. |
| `InstructionsLoaded`, `ConfigChange`, `Setup` | Composition du contexte, pas découpage du travail. À reconsidérer si la question devient « qu'est-ce qui remplit mon contexte ». |
| `CwdChanged`, `DirectoryAdded`, `FileChanged` | Bruit d'environnement. |
| `TeammateIdle`, `WorktreeCreate`, `WorktreeRemove`, `Elicitation`, `ElicitationResult` | Ne correspondent à aucune pratique de ce workflow. |

**Trois événements câblés n'ont jamais été observés** en base : `StopFailure` (erreur d'API), `PostCompact` et `PermissionDenied` (classifieur du mode auto). Ce n'est pas un défaut de câblage — ils sont rares, et `PreCompact` comme `PermissionRequest` arrivent bien, eux. Conséquence à connaître : le KPI « frottement des permissions » affichait structurellement un taux de refus de 0 %, puisque son numérateur ne se déclenchait jamais.

Aucune liste blanche à l'ingestion : `EventProjection` lit `hook_event_name` génériquement. Ajouter un événement se fait donc entièrement dans `~/.claude/settings.json`, sans toucher au backend.

## Doctrine de layout

- **Pleine largeur**, jamais une colonne centrée. Le Gantt a besoin d'espace horizontal : sa largeur *est* du temps, l'écraser détruit l'information.
- **La chronologie est l'élément central**, pas un bloc parmi d'autres. Elle occupe la majeure partie de la largeur ; le coût par agent l'accompagne en colonne latérale.
- Le flux d'événements reste **en dessous**, pleine largeur : consultation ponctuelle, pas surveillance continue.

## Écarts assumés aux conventions habituelles

- **SQLite plutôt que PostgreSQL.** Un outil d'observation locale ne doit pas exiger un conteneur pour démarrer.
- **Pas de conteneurisation, pas de déploiement.** Il tourne sur `localhost:4317` et n'a pas vocation à sortir du poste.
- **Serveur éteint = sessions intactes.** L'observabilité ne doit jamais devenir un point de défaillance de ce qu'elle observe. D'où les hooks `"async": true`, qui n'ajoutent aucune latence à la boucle et ne la cassent pas quand rien n'écoute.

## Où lire la suite

Les décisions détaillées vivent dans `plans/`, un fichier par tranche :

| Spec | Sujet |
|---|---|
| `001-observability-baseline.md` | Événements captés, contrat d'API, pipeline hooks → store → SPA |
| `002-timeline-agents.md` | Cycle de vie des agents, tokenomique réelle, Gantt |
| `003-multi-sessions.md` | Toutes les sessions plutôt qu'une seule élue |
| `004-cout-equivalent-api.md` | Tokens → dollars, tarification par compartiment et par modèle |
