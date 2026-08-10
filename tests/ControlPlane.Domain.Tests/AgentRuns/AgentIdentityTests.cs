using ControlPlane.Domain.AgentRuns;

namespace ControlPlane.Domain.Tests.AgentRuns;

/// <summary>
/// Le trait d'union entre les deux sources de vérité : sans cette normalisation, les
/// événements de hooks et les lanes issues des transcripts ne se joignent sur rien.
/// </summary>
public sealed class AgentIdentityTests
{
    [Fact]
    public void Le_prefixe_de_nom_de_fichier_est_retire()
    {
        Assert.Equal("af63d9487b0cfc1d6", AgentIdentity.Normalize("agent-af63d9487b0cfc1d6"));
    }

    [Fact]
    public void Un_identifiant_deja_nu_est_inchange()
    {
        Assert.Equal("af63d9487b0cfc1d6", AgentIdentity.Normalize("af63d9487b0cfc1d6"));
    }

    /// <summary>Idempotence : la fonction doit pouvoir être posée sur un chemin déjà normalisé
    /// sans amputer l'identifiant une seconde fois.</summary>
    [Fact]
    public void La_normalisation_est_idempotente()
    {
        string once = AgentIdentity.Normalize("agent-abc123")!;

        Assert.Equal(once, AgentIdentity.Normalize(once));
    }

    [Fact]
    public void La_casse_du_prefixe_est_ignoree()
    {
        Assert.Equal("abc123", AgentIdentity.Normalize("AGENT-abc123"));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Un_identifiant_absent_reste_absent(string? agentId)
    {
        Assert.Null(AgentIdentity.Normalize(agentId));
    }

    /// <summary>Un identifiant qui commence par les mêmes lettres sans être le préfixe ne doit
    /// pas être amputé.</summary>
    [Fact]
    public void Un_identifiant_qui_ressemble_au_prefixe_nest_pas_ampute()
    {
        Assert.Equal("agentic", AgentIdentity.Normalize("agentic"));
    }
}
