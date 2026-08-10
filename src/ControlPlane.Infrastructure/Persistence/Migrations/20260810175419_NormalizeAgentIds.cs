using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ControlPlane.Infrastructure.Persistence.Migrations
{
    /// <summary>
    /// Migration de <b>données</b>, sans changement de schéma : aligne les identifiants
    /// d'agent déjà en base sur la forme des hooks.
    ///
    /// <para>Les transcripts étaient découverts par nom de fichier
    /// (<c>subagents/agent-&lt;id&gt;.jsonl</c>) et persistaient le préfixe <c>agent-</c>, que les
    /// hooks n'envoient pas. Les deux sources n'étaient donc jamais jointes — intersection
    /// mesurée sur les données du poste : 18 identifiants côté hooks, 15 côté transcripts,
    /// 0 en commun. Voir <c>AgentIdentity</c> et plans/005-gantt-exploitable.md.</para>
    /// </summary>
    public partial class NormalizeAgentIds : Migration
    {
        // 'agent-' fait 6 caractères ; SUBSTR est indexé à 1 en SQLite.
        private const string StripPrefix = "SUBSTR(agent_id, 7)";

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                $"UPDATE model_usages SET agent_id = {StripPrefix} WHERE agent_id LIKE 'agent-%';");

            migrationBuilder.Sql(
                $"UPDATE agent_runs SET agent_id = {StripPrefix} WHERE agent_id LIKE 'agent-%';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Réversible, mais pas idempotente au sens strict : réappliquer Down deux fois
            // empilerait les préfixes. Le garde `NOT LIKE` l'en empêche.
            migrationBuilder.Sql(
                "UPDATE model_usages SET agent_id = 'agent-' || agent_id WHERE agent_id IS NOT NULL AND agent_id NOT LIKE 'agent-%';");

            migrationBuilder.Sql(
                "UPDATE agent_runs SET agent_id = 'agent-' || agent_id WHERE agent_id NOT LIKE 'agent-%';");
        }
    }
}
