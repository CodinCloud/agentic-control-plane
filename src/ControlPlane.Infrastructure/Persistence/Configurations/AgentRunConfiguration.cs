using ControlPlane.Domain.AgentRuns;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ControlPlane.Infrastructure.Persistence.Configurations;

internal sealed class AgentRunConfiguration : IEntityTypeConfiguration<AgentRun>
{
    public void Configure(EntityTypeBuilder<AgentRun> builder)
    {
        builder.ToTable("agent_runs");

        builder.HasKey(run => run.Id);
        builder.Property(run => run.Id).ValueGeneratedOnAdd();

        builder.Property(run => run.AgentId).IsRequired().HasMaxLength(100);
        builder.Property(run => run.SessionId).IsRequired().HasMaxLength(100);
        builder.Property(run => run.AgentType).HasMaxLength(100);
        builder.Property(run => run.TaskDescription).HasMaxLength(2048);

        builder.Property(run => run.Brief).IsRequired();
        builder.Property(run => run.BriefTruncated).IsRequired();
        builder.Property(run => run.Report).IsRequired();
        builder.Property(run => run.ReportTruncated).IsRequired();

        // The idempotency key: a transcript is reread in full on every SubagentStop, so
        // re-ingestion of an already-seen agent id must update the row, never duplicate it.
        builder.HasIndex(run => run.AgentId).IsUnique();

        builder.HasIndex(run => run.SessionId);
    }
}
