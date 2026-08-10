using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ControlPlane.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddModelUsage : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "model_usages",
                columns: table => new
                {
                    id = table.Column<long>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    message_id = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    session_id = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    agent_id = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    agent_type = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    task_description = table.Column<string>(type: "TEXT", maxLength: 2048, nullable: true),
                    model = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    timestamp_utc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    input_tokens = table.Column<int>(type: "INTEGER", nullable: false),
                    output_tokens = table.Column<int>(type: "INTEGER", nullable: false),
                    cache_creation_tokens = table.Column<int>(type: "INTEGER", nullable: false),
                    cache_read_tokens = table.Column<int>(type: "INTEGER", nullable: false),
                    stop_reason = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    spawn_depth = table.Column<int>(type: "INTEGER", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_model_usages", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_model_usages_agent_type",
                table: "model_usages",
                column: "agent_type");

            migrationBuilder.CreateIndex(
                name: "ix_model_usages_message_id",
                table: "model_usages",
                column: "message_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_model_usages_session_id",
                table: "model_usages",
                column: "session_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "model_usages");
        }
    }
}
