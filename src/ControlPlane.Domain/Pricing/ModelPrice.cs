namespace ControlPlane.Domain.Pricing;

/// <summary>
/// Tarifs d'un modèle, en USD par million de tokens. Les cinq compartiments sont portés
/// séparément parce qu'ils n'ont pas le même prix : un token de sortie coûte cinq fois un
/// token d'entrée, une écriture de cache en TTL 1 h en coûte deux, une lecture de cache un
/// dixième. Additionner les volumes avant de les tarifer — ce que faisait
/// <c>BillableTokens</c> — produit un nombre qui n'est ni un volume utile ni un coût.
/// </summary>
/// <param name="InputPerMTok">Tokens d'entrée non mis en cache.</param>
/// <param name="OutputPerMTok">Tokens générés.</param>
/// <param name="CacheWrite5mPerMTok">Écriture de cache, TTL 5 minutes (1,25× l'entrée).</param>
/// <param name="CacheWrite1hPerMTok">Écriture de cache, TTL 1 heure (2× l'entrée).</param>
/// <param name="CacheReadPerMTok">Lecture de cache (0,1× l'entrée).</param>
public sealed record ModelPrice(
    decimal InputPerMTok,
    decimal OutputPerMTok,
    decimal CacheWrite5mPerMTok,
    decimal CacheWrite1hPerMTok,
    decimal CacheReadPerMTok);
