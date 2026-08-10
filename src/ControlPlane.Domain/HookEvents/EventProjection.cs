using System.Text;
using System.Text.Json;

namespace ControlPlane.Domain.HookEvents;

/// <summary>
/// Pure translation of a raw hook payload (<see cref="JsonElement"/>) into a
/// <see cref="HookEvent"/>. Never throws, never rejects: a missing or unexpectedly-typed
/// field simply projects to null. The raw JSON stays the source of truth in
/// <see cref="HookEvent.Payload"/> (truncated at 32 KB); the typed columns are only a
/// convenience index built from it.
/// </summary>
public static class EventProjection
{
    private const int PayloadMaxBytes = 32 * 1024;

    public static HookEvent Project(JsonElement root, string rawJson, DateTime receivedAtUtc)
    {
        string? cwd = GetString(root, "cwd");

        // duration_ms is the field actually observed in real payloads; execution_time_ms
        // is what the docs advertise but doesn't appear in practice. Both are accepted,
        // duration_ms first, plus the batch variant for PostToolUse batches.
        int? durationMs = GetInt(root, "duration_ms")
            ?? GetInt(root, "execution_time_ms")
            ?? GetInt(root, "batch_execution_time_ms");

        int? inputTokens = GetNestedInt(root, "tokens_used", "input");
        int? outputTokens = GetNestedInt(root, "tokens_used", "output");

        string? error = GetString(root, "tool_error")
            ?? GetString(root, "error_message")
            ?? GetString(root, "denial_reason")
            ?? GetString(root, "permission_reason");

        string? effort = GetNestedString(root, "effort", "level");

        string? source = GetString(root, "source")
            ?? GetString(root, "trigger")
            ?? GetString(root, "end_reason")
            ?? GetString(root, "notification_type")
            ?? GetString(root, "error_type");

        (string payload, bool payloadTruncated) = TruncatePayload(rawJson);

        return HookEvent.Create(
            receivedAtUtc: receivedAtUtc,
            eventName: GetString(root, "hook_event_name"),
            sessionId: GetString(root, "session_id"),
            promptId: GetString(root, "prompt_id"),
            cwd: cwd,
            project: ExtractProjectLeaf(cwd),
            agentId: GetString(root, "agent_id"),
            agentType: GetString(root, "agent_type"),
            toolName: GetString(root, "tool_name"),
            toolUseId: GetString(root, "tool_use_id"),
            durationMs: durationMs,
            inputTokens: inputTokens,
            outputTokens: outputTokens,
            cacheCreationTokens: GetInt(root, "cache_creation_input_tokens"),
            cacheReadTokens: GetInt(root, "cache_read_input_tokens"),
            stopReason: GetString(root, "stop_reason"),
            error: error,
            permissionMode: GetString(root, "permission_mode"),
            effort: effort,
            source: source,
            payload: payload,
            payloadTruncated: payloadTruncated);
    }

    /// <summary>
    /// Reads <c>transcript_path</c> straight off the raw payload. Deliberately not part of
    /// <see cref="Project"/>/<see cref="HookEvent"/>: it isn't a typed column (see the
    /// column table in the plan) but is needed by the transcript ingestion trigger, which
    /// reads the same raw payload the ingestion handler already has in hand.
    /// </summary>
    public static string? ExtractTranscriptPath(JsonElement root) => GetString(root, "transcript_path");

    private static string? ExtractProjectLeaf(string? cwd)
    {
        if (string.IsNullOrWhiteSpace(cwd))
        {
            return null;
        }

        string trimmed = cwd.TrimEnd('/', '\\');
        int lastSeparator = trimmed.LastIndexOfAny(['/', '\\']);

        return lastSeparator >= 0 ? trimmed[(lastSeparator + 1)..] : trimmed;
    }

    /// <summary>
    /// Looks up <paramref name="propertyName"/> at the root of the payload, then falls
    /// back to first-level nested objects, to absorb a possible transport envelope
    /// wrapping the real hook payload.
    /// </summary>
    private static JsonElement? FindProperty(JsonElement root, string propertyName)
    {
        if (root.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        if (root.TryGetProperty(propertyName, out JsonElement direct))
        {
            return direct;
        }

        foreach (JsonProperty property in root.EnumerateObject())
        {
            if (property.Value.ValueKind == JsonValueKind.Object &&
                property.Value.TryGetProperty(propertyName, out JsonElement nested))
            {
                return nested;
            }
        }

        return null;
    }

    private static string? GetString(JsonElement root, string propertyName)
    {
        JsonElement? element = FindProperty(root, propertyName);

        return element is { } value ? AsString(value) : null;
    }

    private static int? GetInt(JsonElement root, string propertyName)
    {
        JsonElement? element = FindProperty(root, propertyName);

        return element is { } value ? AsInt(value) : null;
    }

    private static string? GetNestedString(JsonElement root, string objectName, string propertyName)
    {
        JsonElement? container = FindProperty(root, objectName);

        if (container is not { ValueKind: JsonValueKind.Object } value ||
            !value.TryGetProperty(propertyName, out JsonElement property))
        {
            return null;
        }

        return AsString(property);
    }

    private static int? GetNestedInt(JsonElement root, string objectName, string propertyName)
    {
        JsonElement? container = FindProperty(root, objectName);

        if (container is not { ValueKind: JsonValueKind.Object } value ||
            !value.TryGetProperty(propertyName, out JsonElement property))
        {
            return null;
        }

        return AsInt(property);
    }

    private static string? AsString(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.String => value.GetString(),
        JsonValueKind.Number => value.GetRawText(),
        JsonValueKind.True or JsonValueKind.False => value.GetRawText(),
        _ => null,
    };

    private static int? AsInt(JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out int number))
        {
            return number;
        }

        if (value.ValueKind == JsonValueKind.String && int.TryParse(value.GetString(), out int parsed))
        {
            return parsed;
        }

        return null;
    }

    /// <summary>
    /// Byte-safe truncation at <see cref="PayloadMaxBytes"/> — never splits a multi-byte
    /// UTF-8 sequence. Public because <c>RecordHookEventCommandHandler</c> reuses it to
    /// truncate a raw body that failed to parse as JSON at all (the "Unmarshalable" event
    /// name case), not just the payload of an otherwise well-formed event.
    /// </summary>
    public static (string Payload, bool Truncated) TruncatePayload(string rawJson)
    {
        byte[] bytes = Encoding.UTF8.GetBytes(rawJson);

        if (bytes.Length <= PayloadMaxBytes)
        {
            return (rawJson, false);
        }

        int length = PayloadMaxBytes;

        // Don't split a multi-byte UTF-8 sequence: back up to the start of a character.
        while (length > 0 && (bytes[length] & 0b1100_0000) == 0b1000_0000)
        {
            length--;
        }

        return (Encoding.UTF8.GetString(bytes, 0, length), true);
    }
}
