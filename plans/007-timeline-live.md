# 007 — Timeline vivante : fenêtre glissante ancrée sur « maintenant »

Statut : **décidé** (grooming du 2026-08-11). Successeur direct de `006-gantt-vivant.md`,
dont il révise deux décisions.

## Le défaut mesuré

Capture du 2026-08-11, tour de contrôle, trois sessions actives de 53 s, 55 s et 6 min 59 s.
L'axe affiché : `13:46:04 → 19:46:08 → 01:46:13 → 07:46:18 → 13:46:23`. **Dix-huit heures
d'échelle pour une minute de contenu.**

La cause est la décision #7 du plan 006 : l'axe est `contentSince`/`contentUntil`, c'est-à-dire
l'**union de tout le contenu chargé**. Cette décision était juste pour l'écran d'analyse — une
session terminée veut être vue en entier. Elle est fausse pour la tour de contrôle : il suffit
qu'une session de la veille traîne dans la fenêtre pour que l'axe s'étire sur sa durée et écrase
tout ce qui tourne maintenant en slivers d'un pixel collés au bord droit.

Ce n'est pas un défaut d'esthétique. C'est une échelle fausse, et **une échelle fausse détruit
la seule information que le Gantt existe pour porter**.

Trois défauts secondaires, constatés sur la même capture :

| Défaut | Cause dans le code |
|---|---|
| La piste de zoom s'ouvre dans **toutes** les sessions à la fois | `agentId` vaut `"main"` dans chaque session ; `GanttChart` compare un identifiant non qualifié (`GanttChart.tsx:149-155`). Le commentaire décrivait le cas sans le traiter. |
| ~290 px de hauteur par session pour 6 px de barre | Bandeau + lane + badges qui passent à la ligne + puces + piste ouverte à vide. |
| L'axe de temps défile avec les lanes | `TimelineAxis` est **dans** le conteneur `overflow-y-auto` de `GanttChart`. |

## Ce qu'on décide

### #1 — Deux régimes de fenêtre, pas un

| Écran | Plage | Fenêtre |
|---|---|---|
| Tour de contrôle `/` | `10 min` (défaut) · `30 min` | **glissante**, ancrée sur maintenant |
| Tour de contrôle `/` | `Session entière` | `contentSince`/`contentUntil` — comportement 006 conservé |
| Analyse `/sessions/$id` | inchangé | `contentSince`/`contentUntil` |

La décision #7 du plan 006 n'est pas annulée : elle est **restreinte au régime d'analyse**. Le
serveur reste l'autorité sur les bornes du contenu ; le client décide seulement, en régime
vivant, de ne pas les utiliser comme axe.

La plage « Dernière heure » disparaît. À une heure d'échelle, une session de 50 s occupe 1,4 %
de la largeur — c'est le même défaut, en moins spectaculaire.

### #2 — « Maintenant » est un repère fixe à 85 %, pas au centre

La fenêtre vivante est `[now − span, now + span × 15/85]`. Le repère « maintenant » tombe donc
toujours au même endroit, à 85 % de la largeur, et le temps défile dessous.

Pas au centre, malgré la formulation initiale de la demande : il n'existe **aucune donnée dans
le futur**. Un repère centré condamnerait la moitié droite de l'écran à rester vide en
permanence — or la doctrine de layout dit que la largeur *est* du temps. Les 15 % de marge à
droite servent uniquement à ce que la barre en cours ne pousse pas contre la bordure du cadre.

Conséquence : une lane encore en cours s'arrête **au repère**, jamais au bord droit de la
fenêtre. `barPosition` prend désormais `nowMs` pour cela.

### #3 — Le défilement est continu, en CSS, sans boucle d'animation

La décision #9 du plan 006 — *« jamais de canvas, jamais de boucle d'animation »* — visait
`requestAnimationFrame` et le dessin impératif. Elle est maintenue dans son esprit et amendée
dans sa lettre :

- `useNowTick` passe de 3 s à **1 s** : un re-render React par seconde, pas plus ;
- barres, ticks, lignes de grille et repère portent `transition-[left,width] duration-1000
  ease-linear`. **Le GPU interpole entre deux ticks** ; aucune boucle JS, aucun canvas.

Les clés React sont des **instants absolus** (`key = tickMs`), jamais des index : c'est ce qui
permet à un tick de glisser au lieu de se téléporter quand la fenêtre bouge.

### #4 — Les graduations tombent sur des instants ronds

`timeTicks` répartissait 5 ticks à pourcentage fixe, ce qui produit des libellés arbitraires
(`19:46:08`) et, en régime glissant, des ticks immobiles avec des libellés qui défilent — le
contraire de ce qu'on veut voir. Remplacé par `axisTicks` : un pas « rond » choisi dans une
échelle fixe (1 s … 24 h), puis énumération des multiples de ce pas contenus dans la fenêtre.
Les ticks glissent alors avec la donnée.

### #5 — Une grille verticale et un repère « maintenant », en surcouche unique

Une seule surcouche absolue au-dessus de toutes les lanes, décalée de la largeur de la colonne
de libellés — pas un rendu par lane. Les lignes de grille tombent des mêmes instants que les
graduations ; le repère « maintenant » est une ligne distincte, en `--primary`.

### #6 — La sélection d'agent est qualifiée par sa session

Le jeton de sélection devient `sessionId::agentId` au lieu de `agentId`. C'est ce qui répare
l'ouverture simultanée de la piste dans toutes les sessions. Le search param `?agent=` porte le
jeton composite.

### #7 — Les sous-agents cessent d'être des lanes comme les autres

L'outil existe pour une question — *déléguer coûte-t-il moins cher ?* — et à l'écran, rien ne
distingue un sous-agent de la session qui l'a lancé : même rangée, même traitement, empilés
sans lien visible. Sur la capture du 2026-08-11, on ne voit d'ailleurs *que* des lanes
« Session principale ».

Trois changements, tous portés par des champs déjà au contrat (`spawnDepth`, `agentType`,
`taskDescription`, `isMainSession`) — aucune donnée nouvelle :

- **Filiation visible.** La lane principale reste en position 0, sans retrait. Les sous-agents
  sont décalés à droite d'un cran par niveau de `spawnDepth`, avec un rail vertical qui les
  rattache à leur session. On lit « qui a lancé quoi » sans cliquer.
- **Le type d'agent prend le pas sur tout le reste.** `backend-dev` en gras dans sa couleur
  catégorielle, le brief (`taskDescription`) juste dessous. C'est l'identité qui compte, pas
  l'UUID.
- **Le bandeau de session compte les sous-agents et leur parallélisme** — « 4 sous-agents ·
  2 en parallèle au pic ». Le parallélisme est ce que le Gantt sert à voir ; le chiffrer dans
  l'en-tête donne la conclusion avant même de lire la géométrie.

Un sous-agent en cours porte un halo pulsé sur sa barre : dans un workflow de délégation, la
question « qui tourne encore » se pose toutes les trente secondes.

### #8 — Ce qui ne bouge pas

Explicitement conservés, contre la tentation de tout réécrire :

- **Les quatre badges** 🧠 ⚡ 🔧 🕐 sur chaque lane — décision de l'auteur, ils servent au
  diagnostic. On corrige seulement leur passage à la ligne.
- **Le bandeau de puces** *et* la colonne de libellés — les deux survivent, rôles séparés :
  la lane porte la géométrie, la puce porte la navigation.
- L'épaisseur de barre proportionnelle aux tokens, la texture de densité, la palette
  catégorielle à 8 slots, le mode toujours sombre.

## Hors périmètre

- Zoom continu, brush de sélection, glisser-déposer.
- Tout changement du contrat d'API. **Aucune donnée nouvelle n'est demandée au serveur.**
- Le régime d'analyse `/sessions/$id`, qui garde exactement son comportement actuel.

## Risques assumés

| Risque | Réponse |
|---|---|
| Une lane commencée avant `since` est tronquée à gauche, sans le dire | `barPosition` la coupe au bord ; on accepte la troncature silencieuse pour cette tranche. |
| Un re-render par seconde sur un Gantt à 30 lanes | Le rendu est du DOM statique ; c'est la même charge qu'aujourd'hui divisée par trois ticks. À surveiller, pas à prévenir. |
| Les instants ronds s'alignent sur l'epoch UTC | Correct pour tout fuseau à décalage horaire entier (dont l'Europe). Faux à l'Inde (+5 h 30) pour des pas ≥ 1 h. Assumé. |

## Definition of Done

Test runner **vitest** introduit par cette tranche : la géométrie de la fenêtre est arithmétique
pure, c'est exactement ce qui mérite un oracle exécutable plutôt qu'un coup d'œil.

| # | Critère | Oracle | Niveau | Auteur |
|---|---|---|---|---|
| 1 | La fenêtre vivante place « maintenant » à 85 % quelle que soit la plage | `TimelineDomain.living.test.ts` › `livingWindow_places_now_at_marker` | exécutable | session principale |
| 2 | Une plage de 10 min produit une fenêtre de 10 min de passé, jamais l'union du contenu | `TimelineDomain.living.test.ts` › `livingWindow_spans_requested_range` | exécutable | session principale |
| 3 | Une lane en cours s'arrête au repère, pas au bord droit | `TimelineDomain.living.test.ts` › `ongoing_lane_stops_at_now_marker` | exécutable | session principale |
| 4 | Une lane close hors fenêtre est de largeur nulle, une lane à cheval est tronquée au bord | `TimelineDomain.living.test.ts` › `bar_position_clips_to_window` | exécutable | session principale |
| 5 | Les graduations tombent sur des multiples ronds du pas, et le pas s'adapte à la portée | `TimelineDomain.living.test.ts` › `axis_ticks_land_on_round_instants` | exécutable | session principale |
| 6 | Le repère n'est rendu que si « maintenant » est dans la fenêtre (écran d'analyse) | `TimelineDomain.living.test.ts` › `now_marker_absent_outside_window` | exécutable | session principale |
| 7 | Sélectionner la session principale d'une session n'ouvre la piste que dans **celle-là** | `TimelineDomain.living.test.ts` › `selection_token_is_qualified_by_session` | exécutable | session principale |
| 8 | Le pic de parallélisme d'une session est le nombre maximal de sous-agents simultanément ouverts | `TimelineDomain.living.test.ts` › `peak_parallelism_counts_overlapping_subagents` | exécutable | session principale |
| 9 | Le retrait d'une lane suit `spawnDepth`, la principale restant à zéro | `TimelineDomain.living.test.ts` › `lane_indent_follows_spawn_depth` | exécutable | session principale |
| 10 | `npm run build` passe (tsc -b + vite build) | `npm run build` | exécutable | session principale |
| 11 | La timeline défile visiblement et sans à-coups pendant qu'un agent tourne | jugement humain | intentionnel | Jonathan |
| 12 | On distingue d'un coup d'œil un sous-agent de sa session mère, à trois sessions actives | jugement humain | intentionnel | Jonathan |

**Verdict : GO** — dix critères sur douze portent un oracle exécutable et un auteur. Les deux
restants sont des jugements de lisibilité, ce qui est le propre d'une tranche d'UI : ils sont
déclarés comme tels plutôt que déguisés en tests.
