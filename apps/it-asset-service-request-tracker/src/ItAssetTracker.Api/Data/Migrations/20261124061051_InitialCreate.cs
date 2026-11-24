using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ItAssetTracker.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Locations",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    BuildingCode = table.Column<string>(type: "TEXT", maxLength: 10, nullable: false),
                    Building = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    Floor = table.Column<int>(type: "INTEGER", nullable: false),
                    Room = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 200, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Locations", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "People",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    FirstName = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    LastName = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    Email = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false),
                    Department = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    JobTitle = table.Column<string>(type: "TEXT", maxLength: 80, nullable: true),
                    IsTechnician = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_People", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Vlans",
                columns: table => new
                {
                    VlanId = table.Column<int>(type: "INTEGER", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 200, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Vlans", x => x.VlanId);
                    table.CheckConstraint("CK_Vlans_VlanId_Range", "VlanId BETWEEN 1 AND 4094");
                });

            migrationBuilder.CreateTable(
                name: "NetworkSwitches",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Name = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    Model = table.Column<string>(type: "TEXT", maxLength: 60, nullable: false),
                    ManagementIp = table.Column<string>(type: "TEXT", maxLength: 15, nullable: false),
                    LocationId = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_NetworkSwitches", x => x.Id);
                    table.ForeignKey(
                        name: "FK_NetworkSwitches_Locations_LocationId",
                        column: x => x.LocationId,
                        principalTable: "Locations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Assets",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    AssetTag = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    AssetType = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    Manufacturer = table.Column<string>(type: "TEXT", maxLength: 60, nullable: false),
                    Model = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    SerialNumber = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    LocationId = table.Column<int>(type: "INTEGER", nullable: true),
                    AssignedToPersonId = table.Column<int>(type: "INTEGER", nullable: true),
                    PurchaseDate = table.Column<DateOnly>(type: "TEXT", nullable: true),
                    WarrantyEndDate = table.Column<DateOnly>(type: "TEXT", nullable: true),
                    Notes = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    Version = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Assets", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Assets_Locations_LocationId",
                        column: x => x.LocationId,
                        principalTable: "Locations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Assets_People_AssignedToPersonId",
                        column: x => x.AssignedToPersonId,
                        principalTable: "People",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SwitchPorts",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    SwitchId = table.Column<int>(type: "INTEGER", nullable: false),
                    PortName = table.Column<string>(type: "TEXT", maxLength: 12, nullable: false),
                    PortNumber = table.Column<int>(type: "INTEGER", nullable: false),
                    VlanId = table.Column<int>(type: "INTEGER", nullable: true),
                    AdminStatus = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SwitchPorts", x => x.Id);
                    table.CheckConstraint("CK_SwitchPorts_VlanId_Range", "VlanId IS NULL OR VlanId BETWEEN 1 AND 4094");
                    table.ForeignKey(
                        name: "FK_SwitchPorts_NetworkSwitches_SwitchId",
                        column: x => x.SwitchId,
                        principalTable: "NetworkSwitches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SwitchPorts_Vlans_VlanId",
                        column: x => x.VlanId,
                        principalTable: "Vlans",
                        principalColumn: "VlanId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "AssetHistory",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    AssetId = table.Column<int>(type: "INTEGER", nullable: false),
                    ChangedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    FromStatus = table.Column<string>(type: "TEXT", maxLength: 20, nullable: true),
                    ToStatus = table.Column<string>(type: "TEXT", maxLength: 20, nullable: true),
                    FromAssignee = table.Column<string>(type: "TEXT", maxLength: 110, nullable: true),
                    ToAssignee = table.Column<string>(type: "TEXT", maxLength: 110, nullable: true),
                    FromLocation = table.Column<string>(type: "TEXT", maxLength: 40, nullable: true),
                    ToLocation = table.Column<string>(type: "TEXT", maxLength: 40, nullable: true),
                    Note = table.Column<string>(type: "TEXT", maxLength: 300, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AssetHistory", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AssetHistory_Assets_AssetId",
                        column: x => x.AssetId,
                        principalTable: "Assets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "NetworkJacks",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Label = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    LocationId = table.Column<int>(type: "INTEGER", nullable: false),
                    JackType = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    SwitchPortId = table.Column<int>(type: "INTEGER", nullable: true),
                    Notes = table.Column<string>(type: "TEXT", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_NetworkJacks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_NetworkJacks_Locations_LocationId",
                        column: x => x.LocationId,
                        principalTable: "Locations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_NetworkJacks_SwitchPorts_SwitchPortId",
                        column: x => x.SwitchPortId,
                        principalTable: "SwitchPorts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ServiceRequests",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Title = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 4000, nullable: false),
                    Category = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    Priority = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    RequesterId = table.Column<int>(type: "INTEGER", nullable: false),
                    AssigneeId = table.Column<int>(type: "INTEGER", nullable: true),
                    RelatedAssetId = table.Column<int>(type: "INTEGER", nullable: true),
                    RelatedJackId = table.Column<int>(type: "INTEGER", nullable: true),
                    ResolutionNotes = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    ResolvedAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                    ClosedAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                    Version = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ServiceRequests", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ServiceRequests_Assets_RelatedAssetId",
                        column: x => x.RelatedAssetId,
                        principalTable: "Assets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ServiceRequests_NetworkJacks_RelatedJackId",
                        column: x => x.RelatedJackId,
                        principalTable: "NetworkJacks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ServiceRequests_People_AssigneeId",
                        column: x => x.AssigneeId,
                        principalTable: "People",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ServiceRequests_People_RequesterId",
                        column: x => x.RequesterId,
                        principalTable: "People",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TicketEvents",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    ServiceRequestId = table.Column<int>(type: "INTEGER", nullable: false),
                    EventType = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    ActorId = table.Column<int>(type: "INTEGER", nullable: true),
                    ActorName = table.Column<string>(type: "TEXT", maxLength: 110, nullable: false),
                    FromStatus = table.Column<string>(type: "TEXT", maxLength: 20, nullable: true),
                    ToStatus = table.Column<string>(type: "TEXT", maxLength: 20, nullable: true),
                    FromAssignee = table.Column<string>(type: "TEXT", maxLength: 110, nullable: true),
                    ToAssignee = table.Column<string>(type: "TEXT", maxLength: 110, nullable: true),
                    Text = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TicketEvents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TicketEvents_People_ActorId",
                        column: x => x.ActorId,
                        principalTable: "People",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_TicketEvents_ServiceRequests_ServiceRequestId",
                        column: x => x.ServiceRequestId,
                        principalTable: "ServiceRequests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AssetHistory_AssetId_ChangedAt",
                table: "AssetHistory",
                columns: new[] { "AssetId", "ChangedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Assets_AssetTag",
                table: "Assets",
                column: "AssetTag",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Assets_AssignedToPersonId",
                table: "Assets",
                column: "AssignedToPersonId");

            migrationBuilder.CreateIndex(
                name: "IX_Assets_LocationId",
                table: "Assets",
                column: "LocationId");

            migrationBuilder.CreateIndex(
                name: "IX_Assets_SerialNumber",
                table: "Assets",
                column: "SerialNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Assets_Status",
                table: "Assets",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_Assets_WarrantyEndDate",
                table: "Assets",
                column: "WarrantyEndDate");

            migrationBuilder.CreateIndex(
                name: "IX_Locations_BuildingCode_Room",
                table: "Locations",
                columns: new[] { "BuildingCode", "Room" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_NetworkJacks_LocationId_Label",
                table: "NetworkJacks",
                columns: new[] { "LocationId", "Label" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_NetworkJacks_SwitchPortId",
                table: "NetworkJacks",
                column: "SwitchPortId",
                unique: true,
                filter: "SwitchPortId IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_NetworkSwitches_LocationId",
                table: "NetworkSwitches",
                column: "LocationId");

            migrationBuilder.CreateIndex(
                name: "IX_NetworkSwitches_ManagementIp",
                table: "NetworkSwitches",
                column: "ManagementIp",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_NetworkSwitches_Name",
                table: "NetworkSwitches",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_People_Email",
                table: "People",
                column: "Email",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ServiceRequests_AssigneeId",
                table: "ServiceRequests",
                column: "AssigneeId");

            migrationBuilder.CreateIndex(
                name: "IX_ServiceRequests_CreatedAt",
                table: "ServiceRequests",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_ServiceRequests_Priority",
                table: "ServiceRequests",
                column: "Priority");

            migrationBuilder.CreateIndex(
                name: "IX_ServiceRequests_RelatedAssetId",
                table: "ServiceRequests",
                column: "RelatedAssetId");

            migrationBuilder.CreateIndex(
                name: "IX_ServiceRequests_RelatedJackId",
                table: "ServiceRequests",
                column: "RelatedJackId");

            migrationBuilder.CreateIndex(
                name: "IX_ServiceRequests_RequesterId",
                table: "ServiceRequests",
                column: "RequesterId");

            migrationBuilder.CreateIndex(
                name: "IX_ServiceRequests_Status",
                table: "ServiceRequests",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_SwitchPorts_SwitchId_PortName",
                table: "SwitchPorts",
                columns: new[] { "SwitchId", "PortName" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SwitchPorts_VlanId",
                table: "SwitchPorts",
                column: "VlanId");

            migrationBuilder.CreateIndex(
                name: "IX_TicketEvents_ActorId",
                table: "TicketEvents",
                column: "ActorId");

            migrationBuilder.CreateIndex(
                name: "IX_TicketEvents_ServiceRequestId_CreatedAt",
                table: "TicketEvents",
                columns: new[] { "ServiceRequestId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Vlans_Name",
                table: "Vlans",
                column: "Name",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AssetHistory");

            migrationBuilder.DropTable(
                name: "TicketEvents");

            migrationBuilder.DropTable(
                name: "ServiceRequests");

            migrationBuilder.DropTable(
                name: "Assets");

            migrationBuilder.DropTable(
                name: "NetworkJacks");

            migrationBuilder.DropTable(
                name: "People");

            migrationBuilder.DropTable(
                name: "SwitchPorts");

            migrationBuilder.DropTable(
                name: "NetworkSwitches");

            migrationBuilder.DropTable(
                name: "Vlans");

            migrationBuilder.DropTable(
                name: "Locations");
        }
    }
}
