using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ControlPlane.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddAgentRun : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "agent_runs",
                columns: table => new
                {
                    id = table.Column<long>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    agent_id = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    session_id = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    agent_type = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    task_description = table.Column<string>(type: "TEXT", maxLength: 2048, nullable: true),
                    spawn_depth = table.Column<int>(type: "INTEGER", nullable: true),
                    brief = table.Column<string>(type: "TEXT", nullable: false),
                    brief_truncated = table.Column<bool>(type: "INTEGER", nullable: false),
                    report = table.Column<string>(type: "TEXT", nullable: false),
                    report_truncated = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_agent_runs", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_agent_runs_agent_id",
                table: "agent_runs",
                column: "agent_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_agent_runs_session_id",
                table: "agent_runs",
                column: "session_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "agent_runs");
        }
    }
}
