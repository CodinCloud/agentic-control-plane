# Spec 004 — Coût équivalent API

> Objectif : convertir les tokens comptés en **montant**, pour que la question centrale du README — *« un sous-agent scopé coûte-t-il moins que la session principale ? »* — devienne chiffrable en dollars et non en tokens.

## Pourquoi

Le README pose la question : *« le multi-agent fait-il exploser la facture pour rien ? »*. L'outil ne sait pas y répondre. `AgentCostBreakdown` s'appelle « Coût par agent » et n'affiche que des tokens.

Comparer des tokens entre agents est **faux dès que les modèles diffèrent** — ce qui est le cas nominal, pas un cas limite : la session principale tourne sur `claude-opus-5`, les sous-agents scopés sur `claude-sonnet-5`. Un token Opus coûte 1,67× un token Sonnet en entrée, et le compteur actuel les additionne à parité. La barre de répartition affichée aujourd'hui **surestime donc systématiquement la part des sous-agents**, exactement à l'inverse de ce que l'outil est censé démontrer.

Deuxième erreur, indépendante de la première : `BillableTokens = input + output + cacheCreation` additionne trois compartiments dont les tarifs vont de 1× à 5× le prix d'entrée. Cette somme est un volume, pas un coût, et aucun facteur multiplicatif ne peut la rattraper.

## Sémantique — ce que le chiffre veut dire

Le poste travaille sous **abonnement Claude Code forfaitaire**, pas en facturation à l'usage. Le montant calculé n'est donc **pas une facture** : c'est la valorisation du travail aux tarifs API publics — *combien ce travail aurait coûté en pay-per-token*.

C'est une mesure légitime et comparable entre agents, à condition que l'UI ne mente pas sur sa nature. **L'écran nomme ce chiffre « coût équivalent API », jamais « facture » ni « dépense »**, et une note le rappelle dans le bandeau KPI. Un plan de contrôle qui laisserait croire à une facture réelle serait un plan de contrôle qui désinforme.

## Décisions

| # | Décision | Rationale |
|---|---|---|
| 1 | **Équivalent API**, pas facture réelle | Abonnement forfaitaire côté réel ; valoriser aux tarifs publics rend les agents comparables. L'UI porte le mot « équivalent ». |
| 2 | **USD uniquement**, aucune conversion | La grille Anthropic est en USD/MTok. Un taux de change est une donnée qui vieillit en silence et fausse les comparaisons dans le temps — pour un outil local, c'est une dépendance sans contrepartie. |
| 3 | Grille dans **`appsettings.json`**, valeurs par défaut en dur | Un nouveau modèle sort tous les deux mois. Éditer un JSON et redémarrer, sans recompiler ni migrer. |
| 4 | Coût calculé **à la lecture** | Fonction pure appliquée dans les queries. Aucune migration, aucun backfill, corriger un tarif corrige tout l'historique. Contrepartie assumée : un changement de tarif réécrit le passé (voir Risques). |
| 5 | **Chaque compartiment tarifé séparément** | input, output, cache-write 5 min, cache-write 1 h et cache-read ont cinq tarifs distincts. Les additionner avant de tarifer est l'erreur que cette spec corrige. |
| 6 | **Ventilation exacte du cache par TTL** (2 colonnes + migration) | Mesuré sur les transcripts du poste : 5 608 939 tokens en TTL 1 h contre 437 956 en 5 min, soit **93 % en 1 h**. Supposer un TTL unique de 5 min sous-estimerait le coût du cache de ~37 %. La donnée exacte est dans les transcripts et l'app la jette. |
| 7 | Repli **1 h (2×)** quand la ventilation manque | Les lignes déjà en base n'ont pas la ventilation et l'idempotence par `MessageId` empêche leur mise à jour. Se replier sur 1 h coûte ~5 % d'erreur sur le seul historique ; se replier sur 5 min en coûterait ~37 %. On se trompe du bon côté. |
| 8 | Modèle inconnu → coût **`null`**, jamais `0` | Cohérent avec la culture du dépôt (*« un événement rejeté est une mesure perdue à jamais »*). Un tarif manquant est une information ; le remplacer par zéro est un mensonge silencieux qui minore le total. Les modèles non tarifés sont **listés explicitement** dans la réponse et signalés à l'écran. |
| 9 | **Projet de test xUnit** ciblé sur la tarification | Le calcul est une fonction pure : le candidat idéal pour le premier test du dépôt. Les specs 001–003 ont des DoD dont l'oracle est « test de contrat » ; aucun n'existe. Celle-ci en aura. |

## Grille tarifaire

Tarifs Anthropic en **USD par million de tokens**. Les tarifs de cache sont dérivés du tarif d'entrée : cache-write 5 min = 1,25× input, cache-write 1 h = 2× input, cache-read = 0,1× input.

| Modèle | Input | Output | Cache write 5 min | Cache write 1 h | Cache read |
|---|---:|---:|---:|---:|---:|
| `claude-opus-5` | 5,00 | 25,00 | 6,25 | 10,00 | 0,50 |
| `claude-sonnet-5` *(tarif d'introduction)* | 2,00 | 10,00 | 2,50 | 4,00 | 0,20 |
| `claude-sonnet-5` *(tarif standard, à partir du 2026-09-01)* | 3,00 | 15,00 | 3,75 | 6,00 | 0,30 |
| `claude-opus-4-8` | 5,00 | 25,00 | 6,25 | 10,00 | 0,50 |
| `claude-haiku-4-5` | 1,00 | 5,00 | 1,25 | 2,00 | 0,10 |

Seuls `claude-opus-5` et `claude-sonnet-5` apparaissent dans les données actuelles du poste (vérifié : 1 123 et 652 occurrences sur les 12 derniers transcripts). Les deux autres lignes sont là pour ne pas produire de `null` au premier sous-agent Haiku.

> ⚠️ **Le tarif d'introduction Sonnet 5 expire le 2026-08-31**, dans 21 jours. La grille par défaut embarque le tarif d'introduction, qui est celui en vigueur aujourd'hui. Le passage à 3,00 / 15,00 est une **action datée au 2026-09-01**, à faire dans `appsettings.json`. Combiné à la décision #4, ce changement réécrira rétroactivement le coût de tout l'historique Sonnet — c'est l'illustration la plus nette du compromis accepté.

**Correspondance par préfixe.** Les identifiants observés sont des alias courts (`claude-opus-5`), mais l'API en publie aussi des variantes datées (`claude-haiku-4-5-20251001`). La résolution prend **le préfixe le plus long qui correspond**, ce qui encaisse les deux formes sans entrée dupliquée. Aucune correspondance → modèle non tarifé.

## Changements de schéma

`ModelUsage` gagne deux colonnes, alimentées depuis `message.usage.cache_creation` du transcript :

| Colonne | Source JSONL |
|---|---|
| `CacheCreation5mTokens` | `message.usage.cache_creation.ephemeral_5m_input_tokens` |
| `CacheCreation1hTokens` | `message.usage.cache_creation.ephemeral_1h_input_tokens` |

`CacheCreationTokens` (le total plat, déjà lu) **reste** : il sert de source au repli de la décision #7.

Une migration EF les ajoute avec `0` par défaut. `TranscriptProjection.Project` lit le bloc imbriqué quand il existe et retombe sur zéro sinon — même discipline que le reste de la projection : une ligne n'est jamais rejetée pour un champ manquant.

## Modèle de calcul

Fonction pure, dans le domaine, sans I/O :

```
coût(usage) =
    input           × tarif.Input
  + output          × tarif.Output
  + cacheWrite5m    × tarif.CacheWrite5m
  + cacheWrite1h    × tarif.CacheWrite1h
  + cacheRead       × tarif.CacheRead
```

le tout divisé par 1 000 000, en `decimal` — jamais `double` : un montant ne se calcule pas en virgule flottante binaire.

Répartition des tokens de cache-write, dans cet ordre :

1. `CacheCreation5mTokens + CacheCreation1hTokens > 0` → on utilise la ventilation telle quelle.
2. Sinon, `CacheCreationTokens > 0` → **tout est traité comme 1 h** (décision #7).
3. Sinon → aucun coût de cache-write.

Modèle absent de la grille → la ligne ne produit **aucun coût** et son identifiant remonte dans la liste des modèles non tarifés.

## Contrat d'API

`GET /api/stats` — ajouts, aucune suppression :

```jsonc
{
  "totals": {
    "billableTokens": 538200,      // inchangé
    "costUsd": 4.7312,             // null si AUCUNE ligne n'est tarifable
    "unpricedModels": ["claude-experimental-9"]  // [] dans le cas nominal
  },
  "tokensByAgent": [{
    "agentType": "backend-dev",
    "billableTokens": 128400,      // inchangé
    "share": 0.238,                // inchangé — part en tokens
    "costUsd": 0.6420,             // null si le modèle n'est pas tarifé
    "costShare": 0.136             // part en coût — c'est ce que la barre affiche
  }],
  "sessions": [{ "costUsd": 2.114 }]
}
```

`costShare` a pour dénominateur `totals.costUsd`, calculé sur les seules lignes tarifables des deux côtés — sans quoi les parts ne sommeraient pas à 1.

`GET /api/timeline` : chaque entrée de `sessions[]` gagne `costUsd`. Les `lanes[]` restent **inchangées** (hors périmètre, voir plus bas).

## Portée UI

> Révisé le 2026-08-10 : `StatsOverview` a été supprimé lors de l'élagage des KPI (voir `CONTEXT.md` §"Doctrine des KPI"). Le coût total, qui devait y vivre, est rapatrié sur la carte « Coût par agent » — désormais le seul KPI de l'écran.

| Écran | Ajout |
|---|---|
| `AgentCostBreakdown` | Montant par agent à côté des tokens ; **la barre de répartition passe sur `costShare`**. Coût **total** de la fenêtre en pied de carte, avec la mention « équivalent API », et bandeau d'avertissement si `unpricedModels` n'est pas vide. C'est le seul écran qui répond à la question du README. |
| `SessionBanner` | Coût par session, pour comparer deux sessions parallèles à l'œil. |

Formatage : `$1.23` sous 10 $, `$12.3` sous 100 $, `$123` au-delà — même logique de précision décroissante que `formatTokens`. Un coût `null` s'affiche `—`, jamais `$0.00`.

## Definition of Done

| # | Critère | Oracle |
|---|---|---|
| 1 | Chaque compartiment est tarifé à son propre taux | Test unitaire : 1 M tokens dans chacun des cinq compartiments sur `claude-opus-5` → 5,00 / 25,00 / 6,25 / 10,00 / 0,50 |
| 2 | La ventilation TTL du cache est lue depuis le transcript | Test sur `TranscriptProjection` avec un bloc `cache_creation` réel → les deux colonnes sont peuplées |
| 3 | Une ligne sans ventilation se replie sur 1 h | Test unitaire : `CacheCreationTokens = 1M`, ventilation à 0 → 10,00 et non 6,25 |
| 4 | Modèle inconnu → coût `null` et identifiant listé | Test unitaire sur un modèle absent de la grille |
| 5 | La correspondance par préfixe encaisse les identifiants datés | Test unitaire : `claude-haiku-4-5-20251001` résout vers l'entrée `claude-haiku-4-5` |
| 6 | Le calcul est en `decimal` | Revue de code — aucun `double` sur le chemin du montant |
| 7 | L'écran montre un coût par agent et une barre basée sur le coût | Jugement humain |
| 8 | Le mot « équivalent » figure à l'écran | Jugement humain |

## Risques ouverts

1. **Le passé est réécrit à chaque changement de tarif.** Conséquence directe de la décision #4, et l'expiration du tarif Sonnet le 2026-08-31 la déclenchera dans 21 jours. Accepté : pour un outil local dont la fenêtre nominale est de 24 h, la simplicité vaut plus que la fidélité historique. Si la comparaison inter-mois devient un besoin, la parade est la grille horodatée écartée en décision #4.
2. **~5 % d'erreur sur le cache-write historique**, borné aux lignes déjà en base et connu par construction (décision #7).
3. **Le tarif d'introduction Sonnet est une bombe à retardement silencieuse.** Aucun mécanisme ne rappellera de l'éditer. Si ça devient gênant, le correctif minimal est un `EffectiveUntil` optionnel par entrée qui journalise un avertissement au démarrage — pas une grille horodatée complète.
4. **Le forfait réel reste invisible.** L'outil dira « ce travail vaut 12 $ d'API » sans jamais dire ce qu'il a réellement coûté sur l'abonnement. C'est le prix de la décision #1 ; la mesure « part de quota consommée » a été écartée du périmètre.

## Hors périmètre

- Coût par **run d'agent** (`AgentDetailPanel`, lanes du Gantt) — la donnée sera disponible dans les queries, l'affichage attendra.
- Part de quota d'abonnement consommée.
- Conversion en euros, taux de change, sélecteur de devise.
- Grille tarifaire horodatée, éditable en base ou via une UI de réglages.
- Alertes ou budgets (« prévenir au-delà de X $ »).
