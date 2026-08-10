namespace ControlPlane.Domain.AgentRuns;

/// <summary>
/// Réconcilie les deux façons dont un sous-agent se nomme selon la source.
///
/// <para>Les hooks envoient l'identifiant <b>nu</b> — <c>af63d9487b0cfc1d6</c>. Les
/// transcripts, eux, sont découverts par nom de fichier
/// (<c>subagents/agent-&lt;id&gt;.jsonl</c>) et traînaient donc le préfixe
/// <c>agent-</c>. Les deux sources n'étaient de ce fait <b>jamais jointes</b> : sur 18
/// identifiants côté hooks et 15 côté transcripts, l'intersection mesurée était vide.</para>
///
/// <para>La forme canonique est celle des hooks : c'est la source la plus volumineuse, et
/// c'est elle qu'on ne contrôle pas. Tout ce qui entre en base passe par ici.</para>
/// </summary>
public static class AgentIdentity
{
    private const string FilePrefix = "agent-";

    /// <summary>
    /// Retire le préfixe de nom de fichier s'il est présent. Idempotent : appliquer la
    /// fonction deux fois donne le même résultat, ce qui la rend sûre à poser sur un chemin
    /// déjà normalisé.
    /// </summary>
    public static string? Normalize(string? agentId)
    {
        if (string.IsNullOrWhiteSpace(agentId))
        {
            return null;
        }

        string trimmed = agentId.Trim();

        return trimmed.StartsWith(FilePrefix, StringComparison.OrdinalIgnoreCase)
            ? trimmed[FilePrefix.Length..]
            : trimmed;
    }
}
