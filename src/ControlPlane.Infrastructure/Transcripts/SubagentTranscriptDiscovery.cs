using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace ControlPlane.Infrastructure.Transcripts;

/// <summary>One discovered subagent transcript, paired with whatever its <c>.meta.json</c> yielded.</summary>
internal sealed record SubagentTranscriptFile(
    string Path,
    string AgentId,
    string? AgentType,
    string? TaskDescription,
    int? SpawnDepth);

/// <summary>
/// Locates subagent transcripts on disk from the main transcript's path: they live under
/// <c>&lt;project dir&gt;/&lt;session_id&gt;/subagents/agent-&lt;id&gt;.jsonl</c>, each with a sibling
/// <c>.meta.json</c> carrying <c>agentType</c>/<c>description</c>/<c>spawnDepth</c>. Tolerant
/// throughout: a missing folder, an unreadable directory, or a missing/corrupt meta file
/// never fails the discovery — a subagent with no meta just loses its labeling, it isn't dropped.
/// </summary>
internal static class SubagentTranscriptDiscovery
{
    public static IReadOnlyList<SubagentTranscriptFile> Discover(string transcriptPath, string sessionId, ILogger logger)
    {
        string? projectDir = Path.GetDirectoryName(transcriptPath);

        if (string.IsNullOrEmpty(projectDir))
        {
            return [];
        }

        string subagentsDir = Path.Combine(projectDir, sessionId, "subagents");

        if (!Directory.Exists(subagentsDir))
        {
            return [];
        }

        string[] jsonlFiles;
        try
        {
            jsonlFiles = Directory.GetFiles(subagentsDir, "*.jsonl");
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            logger.LogWarning(ex, "Could not list subagent transcripts under {Dir}; skipping.", subagentsDir);
            return [];
        }

        var results = new List<SubagentTranscriptFile>(jsonlFiles.Length);

        foreach (string jsonlFile in jsonlFiles)
        {
            string agentId = Path.GetFileNameWithoutExtension(jsonlFile);
            string metaPath = Path.Combine(subagentsDir, agentId + ".meta.json");

            (string? agentType, string? description, int? spawnDepth) = TryReadMeta(metaPath, logger);

            results.Add(new SubagentTranscriptFile(jsonlFile, agentId, agentType, description, spawnDepth));
        }

        return results;
    }

    private static (string? AgentType, string? Description, int? SpawnDepth) TryReadMeta(string metaPath, ILogger logger)
    {
        if (!File.Exists(metaPath))
        {
            return (null, null, null);
        }

        try
        {
            using var stream = new FileStream(metaPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            using JsonDocument document = JsonDocument.Parse(stream);
            JsonElement root = document.RootElement;

            string? agentType = GetString(root, "agentType");
            string? description = GetString(root, "description");
            int? spawnDepth = GetInt(root, "spawnDepth");

            return (agentType, description, spawnDepth);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException)
        {
            logger.LogDebug(ex, "Could not read subagent meta {Path}; proceeding without it.", metaPath);
            return (null, null, null);
        }
    }

    private static string? GetString(JsonElement root, string propertyName) =>
        root.TryGetProperty(propertyName, out JsonElement value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

    private static int? GetInt(JsonElement root, string propertyName) =>
        root.TryGetProperty(propertyName, out JsonElement value) &&
        value.ValueKind == JsonValueKind.Number &&
        value.TryGetInt32(out int number)
            ? number
            : null;
}
