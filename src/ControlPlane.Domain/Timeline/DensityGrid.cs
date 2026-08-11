namespace ControlPlane.Domain.Timeline;

/// <summary>Shared axis for every lane in a <c>GET /api/timeline</c> response —
/// <c>bucketMs</c> is the same clock duration for every lane, computed once on
/// <c>[ContentSince, ContentUntil]</c>. See plans/006-gantt-vivant.md décision #7: a bucket
/// that means something different from one lane to the next would make comparing two
/// densities meaningless.</summary>
public sealed record Grid(long BucketMs, int BucketCount);

/// <summary>One lane's texture. <see cref="FirstBucket"/> is the index, in the shared
/// <see cref="Grid"/>, of the first bucket this lane covers — a short lane starting mid-window
/// doesn't carry <see cref="Grid.BucketCount"/> leading zeros.</summary>
public sealed record LaneDensity(int FirstBucket, IReadOnlyList<int> Buckets);

/// <summary>
/// Pure bucketing math, no I/O. <see cref="FloorWindow"/> guarantees
/// <c>ContentUntil &gt; ContentSince</c> even for a lane that spans a single instant — a
/// zero-width span would otherwise collapse every bucket to the same width (or divide by
/// zero), per plans/006-gantt-vivant.md décision #7 / DoD critère 10.
/// </summary>
public static class DensityGrid
{
    /// <summary>Fixed per décision #7 — a variable bucket count would make two responses'
    /// grids incomparable to a client that caches by shape.</summary>
    public const int BucketCount = 240;

    /// <summary>Explicit floor: a window narrower than this is widened forward (never
    /// backward — <c>ContentSince</c> must never predate what was actually observed) before
    /// computing bucket width.</summary>
    private static readonly TimeSpan MinimumSpan = TimeSpan.FromSeconds(1);

    public static (DateTime ContentSince, DateTime ContentUntil) FloorWindow(DateTime since, DateTime until) =>
        until > since ? (since, until) : (since, since + MinimumSpan);

    /// <summary>Builds the shared grid for an already-floored <c>[contentSince, contentUntil]</c>
    /// window. <c>bucketMs</c> rounds up so <see cref="BucketCount"/> buckets always cover the
    /// whole span (a floor rounding could leave a sliver of the window uncovered by any bucket).</summary>
    public static Grid BuildGrid(DateTime contentSince, DateTime contentUntil)
    {
        double spanMs = (contentUntil - contentSince).TotalMilliseconds;
        long bucketMs = Math.Max(1, (long)Math.Ceiling(spanMs / BucketCount));

        return new Grid(bucketMs, BucketCount);
    }

    /// <summary>Index of the bucket <paramref name="timestamp"/> falls into, clamped to
    /// <c>[0, BucketCount - 1]</c> — a timestamp outside <c>[contentSince, contentUntil]</c>
    /// (e.g. a still-open lane's "now") lands on the nearest edge bucket rather than
    /// producing an out-of-range index.</summary>
    public static int BucketIndex(DateTime contentSince, long bucketMs, DateTime timestamp)
    {
        double deltaMs = (timestamp - contentSince).TotalMilliseconds;
        int index = (int)Math.Floor(deltaMs / bucketMs);

        return Math.Clamp(index, 0, BucketCount - 1);
    }

    /// <summary>
    /// Builds one lane's density against the shared grid. <paramref name="toolCallTimestamps"/>
    /// must already be filtered to tool calls only (<see cref="LaneAssembly.IsToolCallEvent"/>)
    /// — this function only buckets, it doesn't classify events (DoD critère 8/9).
    /// </summary>
    public static LaneDensity BuildLaneDensity(
        DateTime laneStart,
        DateTime laneEnd,
        DateTime contentSince,
        long bucketMs,
        IReadOnlyList<DateTime> toolCallTimestamps)
    {
        int firstBucket = BucketIndex(contentSince, bucketMs, laneStart);
        int lastBucket = Math.Max(firstBucket, BucketIndex(contentSince, bucketMs, laneEnd));

        var buckets = new int[lastBucket - firstBucket + 1];

        foreach (DateTime timestamp in toolCallTimestamps)
        {
            int index = Math.Clamp(BucketIndex(contentSince, bucketMs, timestamp) - firstBucket, 0, buckets.Length - 1);
            buckets[index]++;
        }

        return new LaneDensity(firstBucket, buckets);
    }
}
