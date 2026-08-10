using ControlPlane.Application.Abstractions.Clock;

namespace ControlPlane.Infrastructure.Clock;

internal sealed class DateTimeProvider : IDateTimeProvider
{
    public DateTime UtcNow => DateTime.UtcNow;
}
