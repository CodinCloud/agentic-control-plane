using ControlPlane.Domain.Abstractions;

namespace ControlPlane.Domain.HookEvents;

/// <summary>
/// Ingestion itself never fails (see <see cref="EventProjection"/>), so this class is
/// unused by Slice 1. It is scaffolded now, per convention, for the read-side use cases
/// (e.g. GetEventByIdQuery) that will need it.
/// </summary>
public static class HookEventErrors
{
    public static Error NotFound(long id) =>
        Error.NotFound("HookEvents.NotFound", $"The hook event '{id}' was not found");
}
