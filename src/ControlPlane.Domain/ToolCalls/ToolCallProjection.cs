using System.Text.Json;

namespace ControlPlane.Domain.ToolCalls;

/// <summary>
/// Traduction pure d'un payload de hook en <see cref="ToolCall"/>. Aucune I/O.
///
/// <para>Même discipline qu'<see cref="ControlPlane.Domain.HookEvents.EventProjection"/> :
/// ne lève jamais, ne rejette jamais. Un champ absent ou d'un type inattendu se projette en
/// null ; un outil inconnu produit <c>Extractable = false</c>, ce qui est un <b>état</b>, pas
/// une erreur.</para>
///
/// <para><b>Les noms de champs sont ceux réellement observés</b> sur les payloads du poste,
/// pas ceux qu'on attendrait. La casse est incohérente entre entrée et sortie —
/// <c>file_path</c> en entrée, <c>filePath</c> en sortie sur <c>Edit</c> — et un
/// <c>PostToolUseFailure</c> ne porte <b>pas</b> de <c>tool_response</c> du tout : il porte
/// <c>error</c>. Voir plans/005-gantt-exploitable.md §"Ce que la mesure a établi".</para>
/// </summary>
public static class ToolCallProjection
{
    /// <summary>Au-delà, l'extrait cesse d'être un extrait — il n'a pas vocation à porter un
    /// résultat complet, seulement à le rendre reconnaissable.</summary>
    private const int MaxExtractLength = 200;

    private const string FailureEventName = "PostToolUseFailure";

    public static ToolCall Project(ToolCallSource source)
    {
        string toolName = string.IsNullOrWhiteSpace(source.ToolName) ? "(inconnu)" : source.ToolName;
        bool failed = source.EventName == FailureEventName;

        if (!TryParse(source.Payload, out JsonElement payload))
        {
            // Payload illisible : on garde l'appel — il a bien eu lieu — mais sans extrait.
            return new ToolCall(source.Id, source.At, toolName, 1, source.DurationMs, failed, null, null, false);
        }

        JsonElement? input = GetObject(payload, "tool_input");
        JsonElement? response = GetObject(payload, "tool_response");

        (string? summary, bool known) = ExtractSummary(toolName, input);
        string? result = failed ? ExtractFailure(payload) : ExtractResult(toolName, response);

        return new ToolCall(source.Id, source.At, toolName, 1, source.DurationMs, failed, summary, result, known);
    }

    /// <summary>
    /// Réunit les appels consécutifs d'un même outil sous un seul glyphe — trois
    /// <c>Read</c> à la suite deviennent <c>📖×3</c>. Le regroupement est purement
    /// séquentiel : deux outils alternés ne se regroupent jamais, et l'ordre est préservé.
    ///
    /// <para>Le groupe garde l'identité et l'horodatage du <b>premier</b> appel — c'est lui
    /// que le panneau de détail ouvrira — additionne les durées, et se déclare en échec dès
    /// qu'un seul de ses membres l'est : une erreur noyée dans un groupe resterait invisible
    /// autrement.</para>
    /// </summary>
    public static IReadOnlyList<ToolCall> GroupConsecutiveRepeats(IReadOnlyList<ToolCall> calls)
    {
        ArgumentNullException.ThrowIfNull(calls);

        var grouped = new List<ToolCall>();

        foreach (ToolCall call in calls)
        {
            ToolCall? previous = grouped.Count == 0 ? null : grouped[^1];

            if (previous is not null && previous.ToolName == call.ToolName)
            {
                grouped[^1] = previous with
                {
                    RepeatCount = previous.RepeatCount + 1,
                    DurationMs = Add(previous.DurationMs, call.DurationMs),
                    Failed = previous.Failed || call.Failed,
                };

                continue;
            }

            grouped.Add(call);
        }

        return grouped;
    }

    private static int? Add(int? left, int? right) => (left, right) switch
    {
        (null, null) => null,
        (null, { } r) => r,
        ({ } l, null) => l,
        ({ } l, { } r) => l + r,
    };

    /// <summary>Extrait de l'entrée. Le booléen dit si l'outil est connu — un outil sans règle
    /// n'est pas une erreur, mais l'UI doit pouvoir l'annoncer.</summary>
    private static (string? Summary, bool Known) ExtractSummary(string toolName, JsonElement? input)
    {
        if (input is not { } fields)
        {
            return (null, IsKnownTool(toolName));
        }

        return toolName switch
        {
            "Bash" or "PowerShell" => (Truncate(GetString(fields, "description") ?? GetString(fields, "command")), true),
            "Read" or "Write" => (Truncate(GetString(fields, "file_path")), true),
            "Edit" => (Truncate(EditSummary(fields)), true),
            "Grep" or "Glob" => (Truncate(PatternSummary(fields)), true),
            "WebFetch" => (Truncate(GetString(fields, "url")), true),
            "WebSearch" => (Truncate(GetString(fields, "query")), true),
            "Task" or "Agent" => (Truncate(TaskSummary(fields)), true),
            "TodoWrite" => ("liste de tâches mise à jour", true),
            _ => (null, false),
        };
    }

    private static string? EditSummary(JsonElement input)
    {
        string? path = GetString(input, "file_path");

        if (path is null)
        {
            return null;
        }

        return GetBool(input, "replace_all") == true ? $"{path} · toutes occurrences" : path;
    }

    private static string? PatternSummary(JsonElement input)
    {
        string? pattern = GetString(input, "pattern");
        string? path = GetString(input, "path");

        if (pattern is null)
        {
            return path;
        }

        return path is null ? pattern : $"{pattern} · {path}";
    }

    private static string? TaskSummary(JsonElement input)
    {
        string? type = GetString(input, "subagent_type");
        string? description = GetString(input, "description");

        if (type is null)
        {
            return description;
        }

        return description is null ? type : $"{type} · {description}";
    }

    /// <summary>
    /// Extrait de la sortie. <b>Jamais</b> <c>originalFile</c> ni <c>content</c> : sur
    /// <c>Edit</c> et <c>Write</c>, ces champs portent le fichier entier. On ne remonte que
    /// des mesures — nombre de fichiers, de lignes, de sections modifiées.
    /// </summary>
    private static string? ExtractResult(string toolName, JsonElement? response)
    {
        if (response is not { } fields)
        {
            return null;
        }

        return toolName switch
        {
            "Bash" or "PowerShell" => Truncate(ShellResult(fields)),
            "Edit" => PatchResult(fields),
            // Un Write crée ou remplace le fichier : son `structuredPatch` est vide, ce qui
            // ferait dire « aucun changement » à la règle d'Edit — exactement l'inverse de
            // ce qui vient de se passer.
            "Write" => "fichier écrit",
            "Grep" => GrepResult(fields),
            "Glob" => GlobResult(fields),
            _ => null,
        };
    }

    private static string? ShellResult(JsonElement response)
    {
        string? stderr = GetString(response, "stderr");

        if (!string.IsNullOrWhiteSpace(stderr))
        {
            return $"stderr : {FirstLine(stderr)}";
        }

        if (GetBool(response, "interrupted") == true)
        {
            return "interrompu";
        }

        string? stdout = GetString(response, "stdout");

        return string.IsNullOrEmpty(stdout) ? "aucune sortie" : $"{CountLines(stdout)} ligne(s)";
    }

    private static string? PatchResult(JsonElement response)
    {
        if (!response.TryGetProperty("structuredPatch", out JsonElement patch) ||
            patch.ValueKind != JsonValueKind.Array)
        {
            return null;
        }

        int sections = patch.GetArrayLength();

        return sections == 0 ? "aucun changement" : $"{sections} section(s) modifiée(s)";
    }

    private static string? GrepResult(JsonElement response)
    {
        int? files = GetInt(response, "numFiles");
        int? lines = GetInt(response, "numLines");

        if (files is null && lines is null)
        {
            return null;
        }

        return lines is null ? $"{files} fichier(s)" : $"{files ?? 0} fichier(s) · {lines} ligne(s)";
    }

    private static string? GlobResult(JsonElement response)
    {
        int? matches = GetInt(response, "totalMatches") ?? GetInt(response, "numFiles");

        return matches is null ? null : $"{matches} correspondance(s)";
    }

    /// <summary>Un <c>PostToolUseFailure</c> ne porte pas de <c>tool_response</c> — le message
    /// est à la racine, sous <c>error</c>.</summary>
    private static string? ExtractFailure(JsonElement payload)
    {
        if (GetBool(payload, "is_interrupt") == true)
        {
            return "interrompu";
        }

        string? error = GetString(payload, "error");

        return error is null ? null : Truncate(FirstLine(error));
    }

    private static bool IsKnownTool(string toolName) => toolName is
        "Bash" or "PowerShell" or "Read" or "Write" or "Edit" or "Grep" or "Glob"
        or "WebFetch" or "WebSearch" or "Task" or "Agent" or "TodoWrite";

    private static bool TryParse(string? rawPayload, out JsonElement payload)
    {
        if (!string.IsNullOrWhiteSpace(rawPayload))
        {
            try
            {
                using JsonDocument document = JsonDocument.Parse(rawPayload);
                payload = document.RootElement.Clone();
                return payload.ValueKind == JsonValueKind.Object;
            }
            catch (JsonException)
            {
                // Payload tronqué à 32 Ko en plein objet : attendu sur un gros Edit, pas un bug.
            }
        }

        payload = default;
        return false;
    }

    private static JsonElement? GetObject(JsonElement root, string propertyName)
    {
        return root.TryGetProperty(propertyName, out JsonElement value) && value.ValueKind == JsonValueKind.Object
            ? value
            : null;
    }

    private static string? GetString(JsonElement element, string propertyName)
    {
        return element.TryGetProperty(propertyName, out JsonElement value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;
    }

    private static int? GetInt(JsonElement element, string propertyName)
    {
        return element.TryGetProperty(propertyName, out JsonElement value) &&
               value.ValueKind == JsonValueKind.Number &&
               value.TryGetInt32(out int number)
            ? number
            : null;
    }

    private static bool? GetBool(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out JsonElement value))
        {
            return null;
        }

        return value.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            _ => null,
        };
    }

    private static string FirstLine(string value)
    {
        int newLine = value.IndexOfAny(['\r', '\n']);
        return newLine < 0 ? value.Trim() : value[..newLine].Trim();
    }

    private static int CountLines(string value) => value.AsSpan().Count('\n') + 1;

    private static string? Truncate(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        string trimmed = value.Trim();

        return trimmed.Length <= MaxExtractLength ? trimmed : trimmed[..MaxExtractLength] + "…";
    }
}
