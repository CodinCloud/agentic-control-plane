using System.Globalization;
using System.Text.Json;

namespace ControlPlane.Domain.ModelUsages;

/// <summary>
/// Pure translation of transcript JSONL lines into <see cref="ModelUsage"/> rows. No file
/// I/O here — see the Infrastructure transcript reader for that; this is testable with
/// plain strings.
///
/// A transcript is being actively appended to by Claude Code while it's read, so a line
/// can land here truncated mid-write: any line that isn't valid JSON, isn't an
/// <c>"type": "assistant"</c> message, or doesn't carry a message id + usage block is
/// silently skipped rather than failing the whole read. Only lines shaped like a real
/// assistant turn ever produce a row.
/// </summary>
public static class TranscriptProjection
{
    /// <param name="jsonlLines">Raw lines of a transcript file, in file order.</param>
    /// <param name="sessionId">The top-level session these lines belong to.</param>
    /// <param name="agentId">Null for the main session's own transcript.</param>
    /// <param name="agentType">Null for the main session's own transcript.</param>
    /// <param name="taskDescription">Null for the main session's own transcript.</param>
    /// <param name="spawnDepth">Null for the main session's own transcript.</param>
    /// <param name="fallbackTimestampUtc">Used when a line's own <c>timestamp</c> is
    /// missing or unparsable, so a row is never dropped for that alone.</param>
    public static IReadOnlyList<ModelUsage> Project(
        IEnumerable<string> jsonlLines,
        string sessionId,
        string? agentId,
        string? agentType,
        string? taskDescription,
        int? spawnDepth,
        DateTime fallbackTimestampUtc)
    {
        var usages = new List<ModelUsage>();

        foreach (string line in jsonlLines)
        {
            ModelUsage? usage = TryProjectLine(
                line, sessionId, agentId, agentType, taskDescription, spawnDepth, fallbackTimestampUtc);

            if (usage is not null)
            {
                usages.Add(usage);
            }
        }

        return usages;
    }

    private static ModelUsage? TryProjectLine(
        string line,
        string sessionId,
        string? agentId,
        string? agentType,
        string? taskDescription,
        int? spawnDepth,
        DateTime fallbackTimestampUtc)
    {
        if (string.IsNullOrWhiteSpace(line))
        {
            return null;
        }

        JsonDocument document;
        try
        {
            document = JsonDocument.Parse(line);
        }
        catch (JsonException)
        {
            // Most likely a line truncated mid-write by a still-running Claude Code
            // process. Never fail the whole read for one bad line.
            return null;
        }

        using (document)
        {
            JsonElement root = document.RootElement;

            if (root.ValueKind != JsonValueKind.Object ||
                !TryGetString(root, "type", out string? type) ||
                type != "assistant")
            {
                return null;
            }

            if (!root.TryGetProperty("message", out JsonElement message) ||
                message.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            if (!TryGetString(message, "id", out string? messageId))
            {
                // The message id is the idempotency key: no id, no row.
                return null;
            }

            if (!message.TryGetProperty("usage", out JsonElement usage) ||
                usage.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            DateTime timestampUtc = TryGetString(root, "timestamp", out string? rawTimestamp) &&
                                     DateTime.TryParse(
                                         rawTimestamp,
                                         CultureInfo.InvariantCulture,
                                         DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal,
                                         out DateTime parsedTimestamp)
                ? parsedTimestamp
                : fallbackTimestampUtc;

            TryGetString(message, "model", out string? model);
            TryGetString(message, "stop_reason", out string? stopReason);

            return ModelUsage.Create(
                messageId: messageId!,
                sessionId: sessionId,
                agentId: agentId,
                agentType: agentType,
                taskDescription: taskDescription,
                model: model,
                timestampUtc: timestampUtc,
                inputTokens: GetInt(usage, "input_tokens"),
                outputTokens: GetInt(usage, "output_tokens"),
                cacheCreationTokens: GetInt(usage, "cache_creation_input_tokens"),
                cacheReadTokens: GetInt(usage, "cache_read_input_tokens"),
                stopReason: stopReason,
                spawnDepth: spawnDepth);
        }
    }

    private static bool TryGetString(JsonElement element, string propertyName, out string? value)
    {
        if (element.TryGetProperty(propertyName, out JsonElement property) &&
            property.ValueKind == JsonValueKind.String)
        {
            value = property.GetString();
            return value is not null;
        }

        value = null;
        return false;
    }

    private static int GetInt(JsonElement element, string propertyName)
    {
        if (element.TryGetProperty(propertyName, out JsonElement property) &&
            property.ValueKind == JsonValueKind.Number &&
            property.TryGetInt32(out int number))
        {
            return number;
        }

        return 0;
    }
}
