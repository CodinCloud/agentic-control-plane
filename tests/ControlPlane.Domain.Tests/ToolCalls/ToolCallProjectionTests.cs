using ControlPlane.Domain.ToolCalls;

namespace ControlPlane.Domain.Tests.ToolCalls;

/// <summary>
/// Oracles 1 à 6 de la Definition of Done — plans/005-gantt-exploitable.md.
/// Les payloads reproduisent les formes <b>réellement observées</b> sur le poste, casse
/// incohérente comprise (<c>file_path</c> en entrée, <c>filePath</c> en sortie).
/// </summary>
public sealed class ToolCallProjectionTests
{
    private static readonly DateTime At = new(2026, 8, 10, 12, 8, 57, DateTimeKind.Utc);

    private static ToolCall Project(string toolName, string payload, string eventName = "PostToolUse") =>
        ToolCallProjection.Project(new ToolCallSource(1, At, toolName, eventName, 774, payload));

    // ---- Oracle 1 : chaque règle lit les champs réellement observés ----

    [Fact]
    public void Bash_remonte_la_description_et_le_compte_de_lignes()
    {
        const string payload = """
            {"tool_name":"Bash","tool_input":{"command":"npm run build","description":"Build le front"},"tool_response":{"stdout":"a\nb\nc","stderr":"","interrupted":false}}
            """;

        ToolCall call = Project("Bash", payload);

        Assert.True(call.Extractable);
        Assert.Equal("Build le front", call.Summary);
        Assert.Equal("3 ligne(s)", call.Result);
        Assert.False(call.Failed);
    }

    [Fact]
    public void Bash_sans_description_retombe_sur_la_commande()
    {
        const string payload = """
            {"tool_input":{"command":"git status"},"tool_response":{"stdout":"","stderr":""}}
            """;

        Assert.Equal("git status", Project("Bash", payload).Summary);
    }

    [Fact]
    public void Bash_signale_stderr_en_priorite()
    {
        const string payload = """
            {"tool_input":{"command":"x"},"tool_response":{"stdout":"peu importe","stderr":"command not found\nligne suivante"}}
            """;

        Assert.Equal("stderr : command not found", Project("Bash", payload).Result);
    }

    [Fact]
    public void Read_remonte_le_chemin()
    {
        const string payload = """
            {"tool_input":{"file_path":"C:\\Dev\\a.cs"},"tool_response":{"type":"text","file":{}}}
            """;

        ToolCall call = Project("Read", payload);

        Assert.True(call.Extractable);
        Assert.Equal("C:\\Dev\\a.cs", call.Summary);
    }

    [Fact]
    public void Grep_combine_motif_et_chemin_puis_compte_les_resultats()
    {
        const string payload = """
            {"tool_input":{"pattern":"TODO","path":"src"},"tool_response":{"numFiles":4,"numLines":12}}
            """;

        ToolCall call = Project("Grep", payload);

        Assert.Equal("TODO · src", call.Summary);
        Assert.Equal("4 fichier(s) · 12 ligne(s)", call.Result);
    }

    [Fact]
    public void Edit_signale_le_remplacement_global()
    {
        const string payload = """
            {"tool_input":{"file_path":"a.ts","replace_all":true},"tool_response":{"structuredPatch":[{},{}]}}
            """;

        ToolCall call = Project("Edit", payload);

        Assert.Equal("a.ts · toutes occurrences", call.Summary);
        Assert.Equal("2 section(s) modifiée(s)", call.Result);
    }

    // ---- Oracle 2 : Edit et Write n'exposent jamais le fichier entier ----

    [Theory]
    [InlineData("Edit")]
    [InlineData("Write")]
    public void Le_contenu_du_fichier_ne_sort_jamais(string toolName)
    {
        const string secret = "CONTENU INTEGRAL DU FICHIER QUI NE DOIT PAS SORTIR";

        // Interpolation volontairement évitée : le JSON se termine par `}}`, que la syntaxe
        // de chaîne brute interpolée lirait comme une fin de trou.
        const string template = """
            {"tool_input":{"file_path":"a.ts","content":"SECRET"},"tool_response":{"filePath":"a.ts","originalFile":"SECRET","content":"SECRET","structuredPatch":[{}]}}
            """;

        string payload = template.Replace("SECRET", secret, StringComparison.Ordinal);

        ToolCall call = Project(toolName, payload);

        Assert.DoesNotContain(secret, call.Summary ?? string.Empty);
        Assert.DoesNotContain(secret, call.Result ?? string.Empty);
        Assert.Equal("a.ts", call.Summary);
    }

    /// <summary>Un <c>Write</c> a un <c>structuredPatch</c> vide : lui appliquer la règle
    /// d'<c>Edit</c> ferait dire « aucun changement » juste après avoir écrit le fichier.</summary>
    [Fact]
    public void Write_ne_dit_jamais_aucun_changement()
    {
        const string payload = """
            {"tool_input":{"file_path":"a.ts","content":"x"},"tool_response":{"filePath":"a.ts","structuredPatch":[]}}
            """;

        ToolCall call = Project("Write", payload);

        Assert.Equal("a.ts", call.Summary);
        Assert.Equal("fichier écrit", call.Result);
    }

    [Fact]
    public void Edit_sans_section_dit_aucun_changement()
    {
        const string payload = """
            {"tool_input":{"file_path":"a.ts"},"tool_response":{"structuredPatch":[]}}
            """;

        Assert.Equal("aucun changement", Project("Edit", payload).Result);
    }

    // ---- Oracle 3 : un outil inconnu est un état, pas une erreur ----

    [Fact]
    public void Un_outil_inconnu_nest_pas_extractible_mais_reste_un_appel()
    {
        const string payload = """
            {"tool_input":{"quelquechose":"valeur"},"tool_response":{"autre":1}}
            """;

        ToolCall call = Project("mcp__inconnu__faire", payload);

        Assert.False(call.Extractable);
        Assert.Null(call.Summary);
        Assert.Null(call.Result);
        Assert.Equal("mcp__inconnu__faire", call.ToolName);
        Assert.Equal(774, call.DurationMs);
    }

    // ---- Oracle 4 : un payload amputé ne fait pas tomber la projection ----

    [Theory]
    [InlineData("""{"tool_input":{"file_path":"a.cs"},"tool_resp""")]
    [InlineData("")]
    [InlineData(null)]
    [InlineData("pas du json du tout")]
    [InlineData("[1,2,3]")]
    public void Un_payload_illisible_produit_un_appel_sans_extrait(string? payload)
    {
        ToolCall call = ToolCallProjection.Project(new ToolCallSource(7, At, "Read", "PostToolUse", 12, payload));

        Assert.False(call.Extractable);
        Assert.Null(call.Summary);
        Assert.Equal(7, call.Id);
        Assert.Equal("Read", call.ToolName);
    }

    [Fact]
    public void Un_payload_sans_tool_response_ne_produit_pas_de_resultat()
    {
        const string payload = """{"tool_input":{"file_path":"a.cs"}}""";

        ToolCall call = Project("Read", payload);

        Assert.True(call.Extractable);
        Assert.Equal("a.cs", call.Summary);
        Assert.Null(call.Result);
    }

    // ---- Échec : l'erreur est à la racine, pas dans tool_response ----

    [Fact]
    public void Un_echec_lit_error_a_la_racine()
    {
        const string payload = """
            {"tool_input":{"command":"x"},"error":"Exit code 1\nStack trace...","is_interrupt":false}
            """;

        ToolCall call = Project("PowerShell", payload, eventName: "PostToolUseFailure");

        Assert.True(call.Failed);
        Assert.Equal("Exit code 1", call.Result);
    }

    [Fact]
    public void Une_interruption_est_annoncee_comme_telle()
    {
        const string payload = """{"tool_input":{"command":"x"},"is_interrupt":true}""";

        Assert.Equal("interrompu", Project("Bash", payload, eventName: "PostToolUseFailure").Result);
    }

    // ---- Oracles 5 et 6 : regroupement des répétitions consécutives ----

    private static ToolCall Call(long id, string toolName, bool failed = false, int? durationMs = 10) =>
        new(id, At, toolName, 1, durationMs, failed, $"appel {id}", null, true);

    [Fact]
    public void Trois_appels_consecutifs_du_meme_outil_forment_un_groupe_de_trois()
    {
        IReadOnlyList<ToolCall> grouped = ToolCallProjection.GroupConsecutiveRepeats(
            [Call(1, "Read"), Call(2, "Read"), Call(3, "Read")]);

        ToolCall group = Assert.Single(grouped);
        Assert.Equal(3, group.RepeatCount);
        Assert.Equal(1, group.Id);
        Assert.Equal("appel 1", group.Summary);
        Assert.Equal(30, group.DurationMs);
    }

    [Fact]
    public void Deux_outils_alternes_ne_se_regroupent_pas()
    {
        IReadOnlyList<ToolCall> grouped = ToolCallProjection.GroupConsecutiveRepeats(
            [Call(1, "Read"), Call(2, "Edit"), Call(3, "Read"), Call(4, "Edit")]);

        Assert.Equal(4, grouped.Count);
        Assert.All(grouped, call => Assert.Equal(1, call.RepeatCount));
    }

    [Fact]
    public void Le_regroupement_preserve_lordre_et_isole_les_series()
    {
        IReadOnlyList<ToolCall> grouped = ToolCallProjection.GroupConsecutiveRepeats(
            [Call(1, "Read"), Call(2, "Read"), Call(3, "Bash"), Call(4, "Read")]);

        Assert.Equal(3, grouped.Count);
        Assert.Equal(("Read", 2), (grouped[0].ToolName, grouped[0].RepeatCount));
        Assert.Equal(("Bash", 1), (grouped[1].ToolName, grouped[1].RepeatCount));
        Assert.Equal(("Read", 1), (grouped[2].ToolName, grouped[2].RepeatCount));
    }

    /// <summary>Un échec noyé dans un groupe resterait invisible : le groupe entier se déclare
    /// en échec dès qu'un seul de ses membres l'est.</summary>
    [Fact]
    public void Un_echec_dans_un_groupe_contamine_le_groupe()
    {
        IReadOnlyList<ToolCall> grouped = ToolCallProjection.GroupConsecutiveRepeats(
            [Call(1, "Bash"), Call(2, "Bash", failed: true), Call(3, "Bash")]);

        ToolCall group = Assert.Single(grouped);
        Assert.True(group.Failed);
        Assert.Equal(3, group.RepeatCount);
    }

    [Fact]
    public void Une_liste_vide_se_regroupe_en_liste_vide()
    {
        Assert.Empty(ToolCallProjection.GroupConsecutiveRepeats([]));
    }
}
