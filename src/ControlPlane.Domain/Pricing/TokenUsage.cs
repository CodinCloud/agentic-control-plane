namespace ControlPlane.Domain.Pricing;

/// <summary>
/// Les tokens d'un usage, ventilés par compartiment tarifaire. Volontairement détaché de
/// <see cref="ControlPlane.Domain.ModelUsages.ModelUsage"/> : le calcul de coût est une
/// fonction pure sur des nombres, il n'a pas à connaître l'entité persistée.
/// </summary>
/// <param name="CacheCreation5mTokens">Écritures de cache en TTL 5 min, lues depuis
/// <c>message.usage.cache_creation.ephemeral_5m_input_tokens</c>.</param>
/// <param name="CacheCreation1hTokens">Écritures de cache en TTL 1 h, lues depuis
/// <c>message.usage.cache_creation.ephemeral_1h_input_tokens</c>.</param>
/// <param name="CacheCreationTotalTokens">Le total plat <c>cache_creation_input_tokens</c>.
/// Conservé parce qu'il est le seul renseigné sur les lignes ingérées avant que la
/// ventilation par TTL ne soit lue — il sert de repli, voir
/// <see cref="CostCalculator.SplitCacheWrite"/>.</param>
public readonly record struct TokenUsage(
    int InputTokens,
    int OutputTokens,
    int CacheCreation5mTokens,
    int CacheCreation1hTokens,
    int CacheCreationTotalTokens,
    int CacheReadTokens);
