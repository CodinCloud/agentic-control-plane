using ControlPlane.Domain.ModelUsages;

namespace ControlPlane.Domain.Tests.ModelUsages;

/// <summary>
/// Oracle 2 de la Definition of Done — plans/004-cout-equivalent-api.md : la ventilation du
/// cache par TTL est bien lue depuis le transcript, et non plus jetée.
/// </summary>
public sealed class TranscriptProjectionCacheSplitTests
{
    private const string SessionId = "dad01096-0000-0000-0000-000000000000";

    private static readonly DateTime Fallback = new(2026, 8, 10, 12, 0, 0, DateTimeKind.Utc);

    private static IReadOnlyList<ModelUsage> Project(string line) =>
        TranscriptProjection.Project(
            [line],
            SessionId,
            agentId: null,
            agentType: null,
            taskDescription: null,
            spawnDepth: null,
            fallbackTimestampUtc: Fallback);

    /// <summary>La forme réelle observée dans les transcripts du poste : un sous-objet
    /// <c>cache_creation</c> à côté du total plat, dont les deux membres somment au total.</summary>
    [Fact]
    public void La_ventilation_par_TTL_est_lue_depuis_le_bloc_cache_creation()
    {
        const string line = """
            {"type":"assistant","timestamp":"2026-08-10T14:05:00Z","message":{"id":"msg_01","model":"claude-opus-5","usage":{"input_tokens":2,"cache_creation_input_tokens":13241,"cache_read_input_tokens":18167,"output_tokens":21,"cache_creation":{"ephemeral_5m_input_tokens":1241,"ephemeral_1h_input_tokens":12000}}}}
            """;

        ModelUsage usage = Assert.Single(Project(line));

        Assert.Equal(1241, usage.CacheCreation5mTokens);
        Assert.Equal(12000, usage.CacheCreation1hTokens);
        Assert.Equal(13241, usage.CacheCreationTokens);
        Assert.Equal(usage.CacheCreationTokens, usage.CacheCreation5mTokens + usage.CacheCreation1hTokens);
    }

    /// <summary>Sans le sous-objet, la ligne reste ingérée : la ventilation vaut zéro et c'est
    /// le repli tarifaire qui prend le relais. Une ligne n'est jamais rejetée pour un champ
    /// manquant.</summary>
    [Fact]
    public void Sans_bloc_cache_creation_la_ligne_reste_ingeree()
    {
        const string line = """
            {"type":"assistant","timestamp":"2026-08-10T14:05:00Z","message":{"id":"msg_02","model":"claude-opus-5","usage":{"input_tokens":2,"cache_creation_input_tokens":13241,"cache_read_input_tokens":18167,"output_tokens":21}}}
            """;

        ModelUsage usage = Assert.Single(Project(line));

        Assert.Equal(0, usage.CacheCreation5mTokens);
        Assert.Equal(0, usage.CacheCreation1hTokens);
        Assert.Equal(13241, usage.CacheCreationTokens);
    }

    /// <summary>Un <c>cache_creation</c> mal typé ne doit pas faire tomber la lecture — même
    /// discipline que le reste de la projection.</summary>
    [Fact]
    public void Un_bloc_cache_creation_mal_type_est_ignore()
    {
        const string line = """
            {"type":"assistant","timestamp":"2026-08-10T14:05:00Z","message":{"id":"msg_03","model":"claude-opus-5","usage":{"input_tokens":2,"cache_creation_input_tokens":10,"output_tokens":1,"cache_creation":"inattendu"}}}
            """;

        ModelUsage usage = Assert.Single(Project(line));

        Assert.Equal(0, usage.CacheCreation5mTokens);
        Assert.Equal(0, usage.CacheCreation1hTokens);
        Assert.Equal(10, usage.CacheCreationTokens);
    }
}
