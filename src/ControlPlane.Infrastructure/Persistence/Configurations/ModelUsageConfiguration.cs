using ControlPlane.Domain.ModelUsages;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ControlPlane.Infrastructure.Persistence.Configurations;

internal sealed class ModelUsageConfiguration : IEntityTypeConfiguration<ModelUsage>
{
    public void Configure(EntityTypeBuilder<ModelUsage> builder)
    {
        builder.ToTable("model_usages");

        builder.HasKey(usage => usage.Id);
        builder.Property(usage => usage.Id).ValueGeneratedOnAdd();

        builder.Property(usage => usage.MessageId).IsRequired().HasMaxLength(100);
        builder.Property(usage => usage.SessionId).IsRequired().HasMaxLength(100);
        builder.Property(usage => usage.AgentId).HasMaxLength(100);
        builder.Property(usage => usage.AgentType).HasMaxLength(100);
        builder.Property(usage => usage.TaskDescription).HasMaxLength(2048);
        builder.Property(usage => usage.Model).HasMaxLength(100);
        builder.Property(usage => usage.StopReason).HasMaxLength(100);

        // Same SQLite round-trip issue as HookEvent.ReceivedAtUtc: no native temporal
        // type, ADO.NET hands the value back Kind=Unspecified, so it's stamped Utc here.
        builder.Property(usage => usage.TimestampUtc)
            .IsRequired()
            .HasConversion(
                toProvider => toProvider,
                fromProvider => DateTime.SpecifyKind(fromProvider, DateTimeKind.Utc));

        builder.Property(usage => usage.InputTokens).IsRequired();
        builder.Property(usage => usage.OutputTokens).IsRequired();
        builder.Property(usage => usage.CacheCreationTokens).IsRequired();
        builder.Property(usage => usage.CacheReadTokens).IsRequired();

        // The idempotency key: the same transcript is reread in full on every Stop, so
        // re-ingestion of an already-seen message id must be a guaranteed no-op.
        builder.HasIndex(usage => usage.MessageId).IsUnique();

        builder.HasIndex(usage => usage.SessionId);
        builder.HasIndex(usage => usage.AgentType);
    }
}
