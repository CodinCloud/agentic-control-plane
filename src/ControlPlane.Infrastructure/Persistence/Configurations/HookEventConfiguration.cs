using ControlPlane.Domain.HookEvents;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ControlPlane.Infrastructure.Persistence.Configurations;

internal sealed class HookEventConfiguration : IEntityTypeConfiguration<HookEvent>
{
    public void Configure(EntityTypeBuilder<HookEvent> builder)
    {
        builder.ToTable("hook_events");

        builder.HasKey(hookEvent => hookEvent.Id);
        builder.Property(hookEvent => hookEvent.Id).ValueGeneratedOnAdd();

        // SQLite has no native temporal type: it round-trips DateTime as TEXT with no offset
        // and no Kind. The provider can't translate DateTimeOffset comparisons/aggregates at
        // all, so the column is plain UTC DateTime — and every value read back is stamped
        // Kind=Utc here, since ADO.NET otherwise hands it back Unspecified.
        builder.Property(hookEvent => hookEvent.ReceivedAtUtc)
            .IsRequired()
            .HasConversion(
                toProvider => toProvider,
                fromProvider => DateTime.SpecifyKind(fromProvider, DateTimeKind.Utc));

        builder.Property(hookEvent => hookEvent.EventName).HasMaxLength(100);
        builder.Property(hookEvent => hookEvent.SessionId).HasMaxLength(100);
        builder.Property(hookEvent => hookEvent.PromptId).HasMaxLength(100);
        builder.Property(hookEvent => hookEvent.Cwd).HasMaxLength(1024);
        builder.Property(hookEvent => hookEvent.Project).HasMaxLength(255);
        builder.Property(hookEvent => hookEvent.AgentId).HasMaxLength(100);
        builder.Property(hookEvent => hookEvent.AgentType).HasMaxLength(100);
        builder.Property(hookEvent => hookEvent.ToolName).HasMaxLength(100);
        builder.Property(hookEvent => hookEvent.ToolUseId).HasMaxLength(100);
        builder.Property(hookEvent => hookEvent.StopReason).HasMaxLength(100);
        builder.Property(hookEvent => hookEvent.PermissionMode).HasMaxLength(100);
        builder.Property(hookEvent => hookEvent.Effort).HasMaxLength(100);
        builder.Property(hookEvent => hookEvent.Source).HasMaxLength(100);

        builder.Property(hookEvent => hookEvent.Payload).IsRequired();
        builder.Property(hookEvent => hookEvent.PayloadTruncated).IsRequired();

        builder.HasIndex(hookEvent => hookEvent.ReceivedAtUtc).IsDescending();
        builder.HasIndex(hookEvent => hookEvent.SessionId);
        builder.HasIndex(hookEvent => hookEvent.Project);
        builder.HasIndex(hookEvent => hookEvent.EventName);
        builder.HasIndex(hookEvent => hookEvent.AgentType);
        builder.HasIndex(hookEvent => hookEvent.ToolName);
    }
}
