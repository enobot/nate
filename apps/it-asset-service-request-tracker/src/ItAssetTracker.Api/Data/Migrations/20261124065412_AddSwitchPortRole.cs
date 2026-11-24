using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ItAssetTracker.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddSwitchPortRole : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Role",
                table: "SwitchPorts",
                type: "TEXT",
                maxLength: 20,
                nullable: false,
                defaultValue: "Access");

            // Databases seeded before this migration already have an uplink as the last port of each
            // switch (description "Uplink to core"). Mark those as Uplink, unless a jack is patched to it.
            migrationBuilder.Sql(
                """
                UPDATE SwitchPorts
                SET Role = 'Uplink'
                WHERE Description = 'Uplink to core'
                  AND PortNumber = (SELECT MAX(p2.PortNumber) FROM SwitchPorts p2 WHERE p2.SwitchId = SwitchPorts.SwitchId)
                  AND Id NOT IN (SELECT SwitchPortId FROM NetworkJacks WHERE SwitchPortId IS NOT NULL);
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Role",
                table: "SwitchPorts");
        }
    }
}
