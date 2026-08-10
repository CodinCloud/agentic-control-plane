using Microsoft.Extensions.Logging;

namespace ControlPlane.Infrastructure.Transcripts;

/// <summary>
/// Reads a JSONL transcript file line by line. Tolerant of the two failure modes that are
/// normal here, not exceptional: the file doesn't exist (yet), or it's momentarily locked.
/// Opened with <see cref="FileShare.ReadWrite"/> so reading never contends with Claude
/// Code, which is actively appending to the same file — without it we'd risk denying
/// Claude Code its own write access.
/// </summary>
internal static class TranscriptFileReader
{
    public static IReadOnlyList<string> TryReadLines(string path, ILogger logger)
    {
        if (!File.Exists(path))
        {
            logger.LogDebug("Transcript file {Path} does not exist; skipping this read.", path);
            return [];
        }

        try
        {
            using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            using var reader = new StreamReader(stream);

            var lines = new List<string>();
            string? line;

            while ((line = reader.ReadLine()) != null)
            {
                lines.Add(line);
            }

            return lines;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            logger.LogWarning(ex, "Could not read transcript file {Path}; skipping this read.", path);
            return [];
        }
    }
}
