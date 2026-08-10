using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ControlPlane.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "hook_events",
                columns: table => new
                {
                    id = table.Column<long>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    received_at_utc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    event_name = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    session_id = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    prompt_id = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    cwd = table.Column<string>(type: "TEXT", maxLength: 1024, nullable: true),
                    project = table.Column<string>(type: "TEXT", maxLength: 255, nullable: true),
                    agent_id = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    agent_type = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    tool_name = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    tool_use_id = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    duration_ms = table.Column<int>(type: "INTEGER", nullable: true),
                    input_tokens = table.Column<int>(type: "INTEGER", nullable: true),
                    output_tokens = table.Column<int>(type: "INTEGER", nullable: true),
                    cache_creation_tokens = table.Column<int>(type: "INTEGER", nullable: true),
                    cache_read_tokens = table.Column<int>(type: "INTEGER", nullable: true),
                    stop_reason = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    error = table.Column<string>(type: "TEXT", nullable: true),
                    permission_mode = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    effort = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    source = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    payload = table.Column<string>(type: "TEXT", nullable: false),
                    payload_truncated = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_hook_events", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_hook_events_agent_type",
                table: "hook_events",
                column: "agent_type");

            migrationBuilder.CreateIndex(
                name: "ix_hook_events_event_name",
                table: "hook_events",
                column: "event_name");

            migrationBuilder.CreateIndex(
                name: "ix_hook_events_project",
                table: "hook_events",
                column: "project");

            migrationBuilder.CreateIndex(
                name: "ix_hook_events_received_at_utc",
                table: "hook_events",
                column: "received_at_utc",
                descending: new bool[0]);

            migrationBuilder.CreateIndex(
                name: "ix_hook_events_session_id",
                table: "hook_events",
                column: "session_id");

            migrationBuilder.CreateIndex(
                name: "ix_hook_events_tool_name",
                table: "hook_events",
                column: "tool_name");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "hook_events");
        }
    }
}
