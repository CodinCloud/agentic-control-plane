using System.Text;
using System.Text.Json;

namespace ControlPlane.Domain.AgentRuns;

/// <summary>
/// Pure translation of a single subagent transcript's JSONL lines into an
/// <see cref="AgentRun"/>: the brief is the text of the <em>first</em> <c>"type": "user"</c>
/// message, the report is the text of the <em>last</em> <c>"type": "assistant"</c> message.
/// A message's content is either a plain string or an array of blocks; only <c>"text"</c>
/// blocks are concatenated — <c>tool_use</c>/<c>tool_result</c> blocks are ignored. Same
/// truncated-mid-write tolerance as <see cref="ControlPlane.Domain.ModelUsages.TranscriptProjection"/>:
/// an unparsable line is skipped, never fails the whole read.
/// </summary>
public static class AgentRunProjection
{
    private const int MaxBytes = 8 * 1024;

    /// <param name="jsonlLines">Raw lines of one subagent transcript file, in file order.</param>
    /// <param name="agentId">The subagent's id — the idempotency key on <see cref="AgentRun"/>.</param>
    /// <param name="sessionId">The top-level session this subagent was spawned from.</param>
    /// <param name="agentType">From the subagent's <c>.meta.json</c>.</param>
    /// <param name="taskDescription">From the subagent's <c>.meta.json</c>.</param>
    /// <param name="spawnDepth">From the subagent's <c>.meta.json</c>.</param>
    /// <returns>Null when the transcript carries no user and no assistant message yet —
    /// nothing to persist rather than an empty row.</returns>
    public static AgentRun? Project(
        IEnumerable<string> jsonlLines,
        string agentId,
        string sessionId,
        string? agentType,
        string? taskDescription,
        int? spawnDepth)
    {
        string? brief = null;
        string? report = null;
        bool foundFirstUser = false;

        foreach (string line in jsonlLines)
        {
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
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
                continue;
            }

            using (document)
            {
                JsonElement root = document.RootElement;

                if (root.ValueKind != JsonValueKind.Object ||
                    !TryGetString(root, "type", out string? type) ||
                    !root.TryGetProperty("message", out JsonElement message) ||
                    message.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                if (type == "user" && !foundFirstUser)
                {
                    brief = ExtractText(message);
                    foundFirstUser = true;
                }
                else if (type == "assistant")
                {
                    // Keeps overwriting: the last assistant message in file order wins.
                    report = ExtractText(message);
                }
            }
        }

        if (brief is null && report is null)
        {
            return null;
        }

        (string briefValue, bool briefTruncated) = Truncate(brief ?? string.Empty);
        (string reportValue, bool reportTruncated) = Truncate(report ?? string.Empty);

        return AgentRun.Create(
            agentId: agentId,
            sessionId: sessionId,
            agentType: agentType,
            taskDescription: taskDescription,
            spawnDepth: spawnDepth,
            brief: briefValue,
            briefTruncated: briefTruncated,
            report: reportValue,
            reportTruncated: reportTruncated);
    }

    /// <summary>Concatenates every <c>"text"</c> block of <c>message.content</c>, or returns
    /// the content as-is when it's a plain string. Non-text blocks (<c>tool_use</c>,
    /// <c>tool_result</c>) are ignored.</summary>
    private static string ExtractText(JsonElement message)
    {
        if (!message.TryGetProperty("content", out JsonElement content))
        {
            return string.Empty;
        }

        if (content.ValueKind == JsonValueKind.String)
        {
            return content.GetString() ?? string.Empty;
        }

        if (content.ValueKind != JsonValueKind.Array)
        {
            return string.Empty;
        }

        var builder = new StringBuilder();

        foreach (JsonElement block in content.EnumerateArray())
        {
            if (block.ValueKind != JsonValueKind.Object ||
                !TryGetString(block, "type", out string? blockType) ||
                blockType != "text" ||
                !TryGetString(block, "text", out string? text))
            {
                continue;
            }

            if (builder.Length > 0)
            {
                builder.Append('\n');
            }

            builder.Append(text);
        }

        return builder.ToString();
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

    /// <summary>Same 8 KB byte-safe truncation as the 32 KB hook payload truncation
    /// (<c>EventProjection.TruncatePayload</c>) — never split a multi-byte UTF-8 sequence.</summary>
    private static (string Value, bool Truncated) Truncate(string value)
    {
        byte[] bytes = Encoding.UTF8.GetBytes(value);

        if (bytes.Length <= MaxBytes)
        {
            return (value, false);
        }

        int length = MaxBytes;

        while (length > 0 && (bytes[length] & 0b1100_0000) == 0b1000_0000)
        {
            length--;
        }

        return (Encoding.UTF8.GetString(bytes, 0, length), true);
    }
}
