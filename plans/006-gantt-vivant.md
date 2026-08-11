# Spec 006 — Gantt vivant, et la session principale comme lane

> Objectif : que le Gantt bouge pendant qu'on le regarde, et qu'il cesse de nier l'existence de l'agent qui fait 90 % du travail.

## Pourquoi

Trois griefs, une racine commune.

**1. Le Gantt ne s'actualise pas** alors que le flux d'événements, lui, est instantané. Les deux ne lisent pas la même table, et l'une des deux n'est pas temps réel (voir `CONTEXT.md` §« Deux horloges »).

**2. La session principale n'existe pas dans le modèle.** `AgentLane` ne décrit que des sous-agents. À l'écran, la session principale est donc représentée **trois fois** — bandeau gris (`SessionBanner`), puce synthétisée côté client (`AgentChips.tsx:28`), en-tête de piste — pendant qu'une quatrième ligne nie son existence : *« Aucun agent dans cette session »* (`SessionGroup.tsx:25`).

C'est conceptuellement faux. Une session contient **toujours au moins un agent : elle-même**. Et c'est l'agent qui compte : 227 des 430 appels d'outil mesurés n'ont aucun `agentId`, c'est-à-dire qu'ils sont les siens.

**3. Une barre pleine ne dit rien de ce qui s'est passé dedans.** Un agent qui a tourné 12 minutes en enchaînant 40 outils et un agent qui a tourné 12 minutes en réfléchissant produisent la même barre. La largeur porte la durée, l'épaisseur porte les tokens, et l'intérieur est vide alors qu'il y a une information à y mettre.

## Ce que la mesure a établi

**1. L'écran était périmé, pas la donnée.** Session `d5da2705` pendant que l'écran affichait « 1 messages » :

```
GET /api/timeline → started 18:58:55Z · ended 19:01:08Z · active false · msgs 6 · lanes 0
```

Six messages en base, un à l'écran. Le rafraîchissement est en cause, pas l'ingestion.

**2. `Stop` est utilisé comme clôture de session, alors qu'il se déclenche à chaque tour.** `GetTimelineQueryHandler.cs:143` construit `stoppedSessionIds` sur `EventName == "Stop"`, et `ResolveEndedAt` en déduit `closed: true`. Conséquence : **dès la fin du premier tour, toute session est marquée terminée pour toujours.** C'est ce que la mesure ci-dessus montre — `active: false` sur une session dans laquelle on est en train de travailler. Le signal de clôture correct est `SessionEnd`, qui est déjà capté et jamais lu.

**3. `isActive` et les bornes dérivent de `ModelUsage`**, qui n'est écrit que sur `Stop`/`SubagentStop` (`RecordHookEventCommand.cs:67`). Une géométrie bâtie là-dessus ne peut pas grandir pendant un tour, par construction.

**4. Le serveur diffuse `Stop` avant que l'ingestion qu'il déclenche ait commité.** Le client invalide 2 s après (`useTimeline.ts:104`), souvent avant le commit — et comme le tour est fini, plus aucun événement ne vient corriger. La fraîcheur ingérée dort en base jusqu'au tour suivant.

**5. Symptôme dérivé, visible à l'œil** : avec une seule ligne `ModelUsage`, `startedAt == endedAt`, la fenêtre ajustée s'écrase au plancher de 1 ms (`TimelineDomain.ts:188`) et les cinq graduations de l'axe affichent la même seconde. Les glyphes d'outils, eux, datés par des hook events en avance, se plaquent au bord droit hors du champ.

**6. La densité ne coûte aucune requête.** `GetTimelineQueryHandler` charge déjà tous les `eventRows` de la fenêtre en mémoire, `AgentId` compris (`:106-110`). Les compteurs, l'écart moyen et les buckets se calculent sur ce qui est déjà là.

## Ce qu'on reprend de disler

Lecture faite de ses sources, pas de sa doc : `AgentSwimLane.vue` n'est **pas** un Gantt. C'est un histogramme de densité à fenêtre glissante (60 buckets sur 1/3/5/10 min, canvas à 30 FPS, axe relatif à maintenant), une ligne par `app:session`. Il n'a ni durée lisible ni comparaison de parallélisme — c'est le *pouls d'activité* que la spec 005 avait écarté (décision #11).

Mais sa forme règle nos défauts par construction, et c'est ça qu'on reprend :

| Chez lui | Ce qu'on en garde |
|---|---|
| Alimenté uniquement par les hook events | La géométrie et la vivacité passent sur les événements |
| Une lane par `app:session` — la session *est* la lane | La session principale devient une lane |
| Densité d'activité dessinée dans la lane | Devient la **texture** de notre barre, sur axe absolu |
| Bandeau de badges par lane (🧠 modèle, ⚡ événements, 🔧 outils, 🕐 écart moyen) | Repris tel quel |
| Canvas, boucle 30 FPS, animation de pulsation | **Écarté** — voir décision #9 |
| Lanes choisies à la main, croix de fermeture | **Écarté** — nos lanes sont découvertes, pas cueillies |

## Décisions

| # | Décision | Rationale |
|---|---|---|
| 1 | **Le « quand » vient des événements, le « combien » de l'usage** | `HookEvent` arrive en continu, `ModelUsage` par tour. Bornes, durée et vivacité sur les événements ; tokens, modèle et coût sur l'usage. C'est la règle qui répare le rafraîchissement, l'axe et le faux « terminée » d'un seul geste. |
| 2 | **`SessionEnd` clôt une session, pas `Stop`** | Fait #2. `Stop` est une fin de *tour* ; l'utiliser comme fin de session est une erreur de lecture du contrat des hooks. |
| 3 | **Bornes = union des deux sources** | `min(premier événement, premier usage)` → `max(dernier événement, dernier usage)`. Aucune source seule ne peut écraser une lane : un sous-agent sans appel d'outil garde les bornes de son usage, une session sans usage ingéré garde celles de ses événements. |
| 4 | **La session principale est une lane, émise par le serveur** | `agentId: "main"`, la sentinelle déjà en vigueur sur `/api/events` (spec 005). Émise par le serveur et non synthétisée par le client : c'est un fait du domaine, pas un artifice d'affichage. Toute session en a exactement une. |
| 5 | **Elle est la première lane, toujours** | C'est la référence à laquelle on compare les sous-agents. Ordre : la principale, puis les autres par `startedAt`. |
| 6 | **Le serveur diffuse « usage ingéré » après commit** | Fait #4. C'est l'événement qui manque au pipeline ; sans lui, aucune invalidation ne suit l'ingestion qu'un `Stop` a déclenchée. |
| 7 | **Le serveur renvoie les bornes du contenu et la grille de buckets** | `fitWindowToSessions` existe côté client uniquement parce que la fenêtre serveur (24 h par défaut) était inutilisable. Puisque le serveur doit de toute façon connaître la grille pour bucketiser, il devient la seule autorité sur l'axe — et une logique de plus quitte le client pour un endroit testable. |
| 8 | **Texture = appels d'outil, pas tous les événements** | La séquence d'outils *est* la méthode de l'agent. Compter `UserPromptSubmit` et `Notification` dedans diluerait le signal qu'on cherche. Les compteurs du bandeau, eux, distinguent les deux (⚡ et 🔧). |
| 9 | **Rendu SVG, pas canvas ; aucune boucle d'animation** | Un renderer impératif et une boucle 30 FPS pour dessiner ~240 rectangles statiques est un coût d'architecture sans contrepartie — et étranger à `react-feature-arch`. On redessine quand la donnée change, pas 30 fois par seconde. |
| 10 | **Texture monochrome, pas de couleur d'échec** | La texture répond « quand était-ce dense ». Ce qui a échoué est la question de la piste détaillée, qui porte déjà un liseré rouge par glyphe (spec 005). Deux encodages de l'échec au même endroit se marchent dessus. |
| 11 | **La piste de la session principale s'ouvre par défaut sur `/sessions/$sessionId`, pas sur `/`** | Entrer dans l'analyse, c'est vouloir fouiller ; entrer dans la tour de contrôle, c'est vouloir la vue d'ensemble. Le search param reste maître dès qu'il est présent. |
| 12 | **La lane principale n'a ni brief ni rapport** | Personne ne l'a briefée — `AgentRun` n'existe que pour les sous-agents. `AgentDetailPanel` doit le **dire**, pas se casser. |

## Contrat d'API

`GET /api/timeline` — ajouts, aucune suppression.

```jsonc
{
  "window": {
    "since": "…", "until": "…",          // inchangé — la fenêtre demandée
    "contentSince": "2026-08-10T18:58:55Z", // bornes réelles du contenu (décision #7)
    "contentUntil": "2026-08-10T19:12:03Z",
    "grid": { "bucketMs": 3000, "bucketCount": 240 },
    "lastTurnStartedAt": "…"             // inchangé
  },
  "sessions": [{
    "sessionId": "…",
    "isActive": true,                     // désormais : dernier *événement* < 5 min
    "endedAt": null,                      // désormais : clos par SessionEnd, pas par Stop
    "lanes": [{
      "agentId": "main",                  // ← la session principale, lane 0
      "agentType": null,                  // l'UI affiche « Session principale »
      "isMainSession": true,
      "startedAt": "…", "endedAt": null, "durationMs": 792000,
      "billableTokens": 15800, "costUsd": 0.17, "model": "claude-opus-5",
      "eventCount": 142,                  // ⚡ tous événements de cette lane
      "toolCallCount": 37,                // 🔧 PostToolUse + PostToolUseFailure
      "avgGapMs": 1240,                   // 🕐 écart moyen entre événements consécutifs
      "density": { "firstBucket": 0, "buckets": [0,2,5,1,0,0,3,…] }
    }]
  }]
}
```

**La grille est partagée**, calculée une fois sur `[contentSince, contentUntil]` : `bucketMs = span / bucketCount`, `bucketCount = 240` fixe. Un bucket vaut donc la même durée d'horloge pour toutes les lanes — sans quoi comparer la densité de deux agents de durées différentes ne voudrait rien dire. `firstBucket` est l'index du premier bucket que la lane recouvre : une lane courte ne transporte pas 240 zéros.

`isMainSession` est redondant avec `agentId == "main"` et c'est voulu : un client ne devrait pas avoir à connaître la sentinelle pour savoir ce qu'il affiche.

**Nouveau message WebSocket** (décision #6) :

```jsonc
{ "type": "usage-ingested", "sessionId": "…" }
```

Émis après le `SaveChangesAsync` de l'ingestion, jamais avant. Le client invalide la timeline dessus, sans debounce — il arrive une fois par tour, pas une fois par outil.

## Rendu

```
┌ Session principale ┐ 🧠 opus-5   ⚡142  🔧37  🕐1.2s
│ ▒▒██▓▒░░▒███▓░░░▒█▒░              │   ← largeur = durée, épaisseur = tokens
└───────────────────────────────────┘      texture = densité d'appels d'outil
      ┌ backend-dev ┐ 🧠 sonnet-5  ⚡38  🔧12
      │ █▓▒░░▒██▒ │                          ← décalée : le parallélisme reste lisible
      └───────────┘
├──────────────────────────────────────────────────────┤
21:00          21:05          21:10          21:15         (axe absolu, partagé)
```

Un rectangle SVG par bucket recouvert, opacité proportionnelle à `count / maxCount` de la **réponse entière** — normaliser par lane ferait paraître un agent tranquille aussi dense que la session principale. Plancher d'opacité non nul sur un bucket à `count > 0` : un appel isolé doit rester visible.

La lane principale porte une couleur neutre claire, distincte de la palette `agentColor(agentType)` réservée aux sous-agents. Elle n'est pas grise : elle n'est pas désactivée.

**Ce qui disparaît de l'UI** — c'est la moitié de l'intérêt :

| Élément | Devient |
|---|---|
| `SessionBanner`, barre grise pleine largeur | En-tête de groupe : projet · modèle · durée · coût. Plus de barre : la lane 0 la remplace. |
| « Aucun agent dans cette session » (`SessionGroup.tsx:25`) | **Supprimé** — impossible à écrire, décision #4. |
| « Aucun agent dans cette plage » (`GanttChart.tsx:174`) | **Supprimé** — `hasAnyLane` est toujours vrai dès qu'il y a une session. |
| Puce « Session principale » synthétique (`AgentChips.tsx:28`) | **Supprimée** — `AgentChips` mappe les lanes, sans cas particulier. |
| `TimelineDomain.fitWindowToSessions` | **Supprimé** — remplacé par `contentSince`/`contentUntil` (décision #7). `extendWindowToNow` reste : il fait grandir la barre entre deux refetch. |

## Contrainte visuelle — tokens shadcn et palette validée

État des lieux : il n'y a **aucune couche de tokens** dans ce projet. Pas de `components.json`, pas une variable CSS (`index.css` fait 17 lignes), et les composants de `components/ui/` sont écrits à la main sur des classes Tailwind en dur — `border-neutral-700 bg-neutral-800`, `bg-sky-500`. « Palette shadcn propre » est donc une tranche de fondation, pas une retouche.

**Couche de tokens.** Tokens sémantiques shadcn en style Tailwind v4 (`@theme inline` + variables sur `:root`), **thème sombre unique** — cet outil tourne sur un second écran et `index.css` l'assume déjà (« Always-dark instrument »). Pas de bascule clair/sombre : un thème qu'on n'utilise pas est un thème qu'on ne teste pas.

| Rôle | Valeur |
|---|---|
| `--background` (plan de page) | `#0d0d0d` |
| `--card` (surface de carte et de graphe) | `#1a1a19` |
| `--foreground` / `--muted-foreground` | `#ffffff` / `#898781` |
| `--border` | `rgba(255,255,255,0.10)` |
| `--primary` | `#3987e5` |

Aucune classe `neutral-*`, `sky-*` ou `emerald-*` en dur ne subsiste dans le code de features : tout passe par `bg-card`, `text-muted-foreground`, `border-border`, `bg-primary`. C'est ce qui rend un changement de palette possible en un endroit.

**Palette catégorielle — 8 slots, ordre fixe, jamais généré.** `TimelineDomain.agentColor` hache aujourd'hui le type d'agent vers une **teinte** (`hsl(${hue} 70% 58%)`, angle d'or — `TimelineDomain.ts:224`). C'est l'anti-pattern à corriger : une teinte générée n'a aucune garantie de contraste ni de séparation pour un daltonien, et deux types d'agent peuvent tomber à 2° l'un de l'autre.

Remplacé par huit slots fixes, validés contre notre surface `#1a1a19` :

```
1 #3987e5  2 #d95926  3 #199e70  4 #c98500
5 #d55181  6 #008300  7 #9085e9  8 #e66767
```

```
[PASS] bande de clarté · [PASS] plancher de chroma · [PASS] séparation CVD (pire paire adjacente ΔE 8,4)
[PASS] plancher vision normale (19,3) · [PASS] contraste ≥ 3:1
```

L'attribution est **explicite par type d'agent connu** (`backend-dev`, `frontend-dev`, `devops-deployer`, `general-purpose`, `Explore`, `Plan`), repli par hachage stable **vers un index de slot** — jamais vers une teinte — pour un type inconnu. La couleur suit l'entité, jamais son rang : filtrer les sessions ne doit repeindre aucune lane survivante. Au-delà de huit, on replie sur une teinte neutre « autre » plutôt que d'en inventer une neuvième.

**La lane principale ne consomme pas de slot.** Elle porte `--primary` : ce n'est pas une série parmi d'autres, c'est la référence à laquelle les autres se comparent. Et surtout, elle n'est **pas grise** — le gris dit « désactivé », ce qui est l'inverse du message.

**Texture.** Rampe séquentielle d'opacité sur la teinte propre de la lane, normalisée sur le maximum de la réponse (décision #10), plancher **0,25** pour qu'un appel isolé reste visible. Cellules contiguës, sans gouttière : c'est une bande de densité continue, pas une série de barres adjacentes — écart assumé à la règle des 2 px entre remplissages, qui n'a pas de sens à 240 cellules. Un liseré `--border` cerne la lane.

**Badges.** Le bandeau de lane utilise le composant `Badge` existant, refondu sur les tokens — pas un `<span>` stylé sur place. Quatre badges : 🧠 modèle, ⚡ événements, 🔧 appels d'outil, 🕐 écart moyen.

**Survol.** Une cellule survolée donne son compte et sa tranche horaire (« 3 appels · 21:04:12–21:04:15 »). Un graphe HTML *est* interactif ; une densité sans survol laisse le lecteur estimer à l'œil ce que la donnée sait exactement.

**Légende.** Le bandeau de puces (`AgentChips`) **est** la légende : pastille de couleur + libellé. L'identité ne repose donc jamais sur la couleur seule — chaque lane porte en plus son propre libellé dans son en-tête.

## Definition of Done

| # | Critère | Oracle |
|---|---|---|
| 1 | Une session sans aucun sous-agent renvoie exactement **une** lane, `agentId: "main"` | Test xUnit sur le handler |
| 2 | La lane principale est toujours en premier | Test xUnit avec deux sous-agents antérieurs à elle |
| 3 | Un `Stop` ne clôt pas une session ; un `SessionEnd` la clôt | Test xUnit : `Stop` → `endedAt: null` ; `SessionEnd` → `endedAt` peuplé |
| 4 | Un événement récent sans usage ingéré suffit à rendre une session active | Test xUnit : événements frais, `ModelUsage` vide → `isActive: true` |
| 5 | Les bornes prennent l'union des deux sources | Test xUnit : usage plus ancien que le premier événement → `startedAt` = usage |
| 6 | La grille est identique pour toutes les lanes de la réponse | Test xUnit |
| 7 | `firstBucket` positionne correctement une lane qui démarre au milieu de la fenêtre | Test xUnit |
| 8 | Trois appels d'outil dans le même bucket donnent `count: 3` | Test xUnit |
| 9 | La densité ne compte que les appels d'outil | Test xUnit : `UserPromptSubmit` dans le bucket → non compté |
| 10 | Une lane d'une seconde ne produit pas une fenêtre dégénérée | Test xUnit : `contentUntil > contentSince`, plancher explicite |
| 11 | L'ingestion diffuse `usage-ingested` après le commit | Test xUnit sur le service, ordre vérifié |
| 12 | Le Gantt se met à jour sans rechargement pendant un tour en cours | Jugement humain |
| 13 | Aucun écran ne dit qu'une session n'a pas d'agent | Jugement humain |
| 14 | `AgentDetailPanel` sur la lane principale explique l'absence de brief au lieu de casser | Jugement humain |
| 15 | Aucune classe de couleur Tailwind en dur (`neutral-*`, `sky-*`, `emerald-*`) hors de la couche de tokens | `grep` sur `src/` |
| 16 | `agentColor` retourne un slot de la palette fixe, jamais une teinte calculée | Revue de code |
| 17 | La couleur d'un agent ne change pas quand on filtre les sessions | Jugement humain |
| 18 | Le bandeau de lane utilise le composant `Badge` | Revue de code |
| 19 | Survoler une cellule de densité donne son compte et sa tranche horaire | Jugement humain |

## Risques ouverts

1. **Deux horloges dans les bornes.** `HookEvent.ReceivedAtUtc` est l'heure d'ingestion serveur ; `ModelUsage.TimestampUtc` vient du transcript. Même machine, même UTC — l'écart est négligeable ici, et l'union de la décision #3 le rend inoffensif. Ce ne serait plus vrai si l'outil devenait distant.
2. **240 buckets est un choix arbitraire.** Sur une fenêtre de 24 h un bucket vaut 6 min, ce qui écrase la texture d'un agent de deux minutes. C'est acceptable parce que la fenêtre nominale est ajustée au contenu, mais un zoom variable rendrait la grille serveur trop rigide — même compromis, et même parade, que le regroupement de la spec 005 (décision #7).
3. **La texture peut mentir par saturation.** Normalisée sur le maximum global, une session principale très active écrase visuellement tous les sous-agents. C'est l'information voulue — c'est l'argument de l'outil — mais si les sous-agents deviennent illisibles, la parade est une échelle par racine carrée, pas une normalisation par lane.
4. **Le poids de la réponse croît avec les lanes.** 15 lanes × jusqu'à 240 buckets d'entiers. Borné, mais à surveiller si les buckets deviennent des objets.
5. **Le critère 11 de la DoD est livré sans oracle.** L'ordre « commit puis diffusion » vit dans `TranscriptIngestionBackgroundService`, un service d'Infrastructure : ni fonction pure du domaine, ni testable dans `ControlPlane.Domain.Tests`. Vérifié par lecture — la publication n'est atteinte que si la persistance a retourné vrai — mais pas par un test. Monter un projet `ControlPlane.Infrastructure.Tests` pour cette seule assertion a été jugé disproportionné ; à rouvrir si une régression de fraîcheur apparaît, puisque c'est précisément ce que ce chaînage garantit.
6. **L'étiquette de projet d'une session suit le dernier `cwd` rapporté.** Observé pendant l'écriture de cette spec : un `cd` dans un `Bash` a fait basculer le libellé de `agentic-control-plane` vers `ControlPlane.Api`. Hors périmètre ici, mais c'est une identité de session qui bouge sans raison.

## Hors périmètre

- Fenêtre glissante relative (1/3/5/10 min) et axe relatif à maintenant — la spec 005 l'a écarté, la texture le remplace.
- Zoom continu, sélection de plusieurs lanes, fermeture de lane à la main.
- Coût par bucket, tokens par bucket : la texture est un compte d'appels, rien de plus.
- Brief et rapport de la session principale — ils n'existent pas (décision #12).
- Correction de l'étiquette de projet (risque #5).
