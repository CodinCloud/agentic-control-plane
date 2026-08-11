using ControlPlane.Domain.Timeline;

namespace ControlPlane.Domain.Tests.Timeline;

/// <summary>
/// Oracles 1 à 5 de la Definition of Done — plans/006-gantt-vivant.md.
/// </summary>
public sealed class LaneAssemblyTests
{
    private static readonly DateTime Now = new(2026, 8, 10, 19, 0, 0, DateTimeKind.Utc);

    // ---- Oracle 1 : une session sans sous-agent renvoie exactement une lane "main" ----

    [Fact]
    public void Une_session_sans_sous_agent_ne_produit_que_la_lane_principale()
    {
        IReadOnlyList<string> agentIds = LaneAssembly.CollectAgentIds(
            eventAgentIds: [null, null],
            usageAgentIds: [null]);

        string agentId = Assert.Single(agentIds);
        Assert.Equal("main", agentId);
    }

    [Fact]
    public void Un_sous_agent_observe_sur_les_evenements_ou_lusage_est_collecte()
    {
        IReadOnlyList<string> agentIds = LaneAssembly.CollectAgentIds(
            eventAgentIds: [null, "backend-dev-1"],
            usageAgentIds: [null, "frontend-dev-1"]);

        Assert.Equal(3, agentIds.Count);
        Assert.Contains("main", agentIds);
        Assert.Contains("backend-dev-1", agentIds);
        Assert.Contains("frontend-dev-1", agentIds);
    }

    // ---- Oracle 2 : la lane principale est toujours en premier ----

    [Fact]
    public void La_lane_principale_reste_premiere_meme_apres_deux_sous_agents_plus_anciens()
    {
        var lanes = new[]
        {
            ("backend-dev-1", new DateTime(2026, 8, 10, 18, 0, 0, DateTimeKind.Utc)),
            ("frontend-dev-1", new DateTime(2026, 8, 10, 18, 30, 0, DateTimeKind.Utc)),
            ("main", new DateTime(2026, 8, 10, 19, 0, 0, DateTimeKind.Utc)),
        };

        IReadOnlyList<(string AgentId, DateTime StartedAt)> ordered =
            LaneAssembly.OrderLanes(lanes, lane => lane.Item1, lane => lane.Item2);

        Assert.Equal("main", ordered[0].AgentId);
        Assert.Equal("backend-dev-1", ordered[1].AgentId);
        Assert.Equal("frontend-dev-1", ordered[2].AgentId);
    }

    // ---- Oracle 3 : Stop ne clôt pas une session ; SessionEnd la clôt ----

    [Fact]
    public void Stop_ne_clot_pas_une_session()
    {
        bool closed = LaneAssembly.HasClosingEvent(["UserPromptSubmit", "PostToolUse", "Stop"], LaneAssembly.SessionEndEventName);

        Assert.False(closed);

        DateTime? endedAt = LaneAssembly.ResolveEndedAt(Now, Now, closed, TimeSpan.FromMinutes(2));

        Assert.Null(endedAt);
    }

    [Fact]
    public void SessionEnd_clot_une_session()
    {
        bool closed = LaneAssembly.HasClosingEvent(["UserPromptSubmit", "Stop", "SessionEnd"], LaneAssembly.SessionEndEventName);

        Assert.True(closed);

        DateTime? endedAt = LaneAssembly.ResolveEndedAt(Now, Now, closed, TimeSpan.FromMinutes(2));

        Assert.Equal(Now, endedAt);
    }

    // ---- Oracle 4 : un événement récent sans usage ingéré suffit à rendre une session active ----

    [Fact]
    public void Un_evenement_frais_sans_usage_rend_la_session_active()
    {
        DateTime freshEvent = Now - TimeSpan.FromSeconds(30);

        bool isActive = LaneAssembly.IsActive(freshEvent, Now, TimeSpan.FromMinutes(5));

        Assert.True(isActive);
    }

    [Fact]
    public void Aucun_evenement_ne_rend_jamais_actif()
    {
        Assert.False(LaneAssembly.IsActive(null, Now, TimeSpan.FromMinutes(5)));
    }

    [Fact]
    public void Un_evenement_ancien_ne_rend_pas_actif()
    {
        DateTime staleEvent = Now - TimeSpan.FromMinutes(10);

        Assert.False(LaneAssembly.IsActive(staleEvent, Now, TimeSpan.FromMinutes(5)));
    }

    // ---- Oracle 5 : les bornes prennent l'union des deux sources ----

    [Fact]
    public void Un_usage_plus_ancien_que_le_premier_evenement_devient_le_debut()
    {
        DateTime firstEvent = new(2026, 8, 10, 18, 5, 0, DateTimeKind.Utc);
        DateTime lastEvent = new(2026, 8, 10, 18, 20, 0, DateTimeKind.Utc);
        DateTime firstUsage = new(2026, 8, 10, 18, 0, 0, DateTimeKind.Utc); // plus ancien
        DateTime lastUsage = new(2026, 8, 10, 18, 15, 0, DateTimeKind.Utc);

        (DateTime start, DateTime end) = LaneAssembly.ResolveBounds(firstEvent, lastEvent, firstUsage, lastUsage, Now);

        Assert.Equal(firstUsage, start);
        Assert.Equal(lastEvent, end);
    }

    [Fact]
    public void Un_sous_agent_sans_appel_doutil_garde_les_bornes_de_son_usage()
    {
        DateTime firstUsage = new(2026, 8, 10, 18, 0, 0, DateTimeKind.Utc);
        DateTime lastUsage = new(2026, 8, 10, 18, 10, 0, DateTimeKind.Utc);

        (DateTime start, DateTime end) = LaneAssembly.ResolveBounds(null, null, firstUsage, lastUsage, Now);

        Assert.Equal(firstUsage, start);
        Assert.Equal(lastUsage, end);
    }

    [Fact]
    public void Une_session_sans_usage_ingere_garde_les_bornes_de_ses_evenements()
    {
        DateTime firstEvent = new(2026, 8, 10, 18, 55, 0, DateTimeKind.Utc);
        DateTime lastEvent = new(2026, 8, 10, 18, 58, 0, DateTimeKind.Utc);

        (DateTime start, DateTime end) = LaneAssembly.ResolveBounds(firstEvent, lastEvent, null, null, Now);

        Assert.Equal(firstEvent, start);
        Assert.Equal(lastEvent, end);
    }

    [Fact]
    public void Labsence_totale_des_deux_sources_retombe_sur_le_repli()
    {
        (DateTime start, DateTime end) = LaneAssembly.ResolveBounds(null, null, null, null, Now);

        Assert.Equal(Now, start);
        Assert.Equal(Now, end);
    }

    // ---- Compteur ⚡ / 🕐 : la densité ne filtre pas, mais ses entrées doivent être filtrées en amont ----

    [Theory]
    [InlineData("PostToolUse", true)]
    [InlineData("PostToolUseFailure", true)]
    [InlineData("UserPromptSubmit", false)]
    [InlineData("Notification", false)]
    [InlineData(null, false)]
    public void Seuls_les_appels_doutil_comptent_pour_la_texture(string? eventName, bool expected)
    {
        Assert.Equal(expected, LaneAssembly.IsToolCallEvent(eventName));
    }

    [Fact]
    public void Lecart_moyen_est_nul_avec_moins_de_deux_evenements()
    {
        Assert.Null(LaneAssembly.AverageGapMs([Now]));
        Assert.Null(LaneAssembly.AverageGapMs([]));
    }

    [Fact]
    public void Lecart_moyen_se_calcule_sur_des_horodatages_meme_desordonnes()
    {
        DateTime t0 = Now;
        DateTime t1 = Now + TimeSpan.FromSeconds(2);
        DateTime t2 = Now + TimeSpan.FromSeconds(6);

        long? avg = LaneAssembly.AverageGapMs([t2, t0, t1]);

        // (2s + 4s) / 2 = 3s
        Assert.Equal(3000, avg);
    }
}
