using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MovieTheater.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Auditoriums",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Name = table.Column<string>(type: "TEXT", maxLength: 60, nullable: false),
                    RowCount = table.Column<int>(type: "INTEGER", nullable: false),
                    SeatsPerRow = table.Column<int>(type: "INTEGER", nullable: false),
                    AisleAfter = table.Column<string>(type: "TEXT", maxLength: 60, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Auditoriums", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ConcessionItems",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Name = table.Column<string>(type: "TEXT", maxLength: 60, nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Category = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    PriceCents = table.Column<int>(type: "INTEGER", nullable: false),
                    IsAvailable = table.Column<bool>(type: "INTEGER", nullable: false),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConcessionItems", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Movies",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Title = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false, collation: "NOCASE"),
                    Tagline = table.Column<string>(type: "TEXT", maxLength: 160, nullable: false),
                    Synopsis = table.Column<string>(type: "TEXT", maxLength: 1200, nullable: false),
                    Genre = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    Rating = table.Column<string>(type: "TEXT", maxLength: 10, nullable: false),
                    RuntimeMinutes = table.Column<int>(type: "INTEGER", nullable: false),
                    PosterPalette = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    PosterMotif = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Movies", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Seats",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    AuditoriumId = table.Column<int>(type: "INTEGER", nullable: false),
                    Row = table.Column<string>(type: "TEXT", maxLength: 2, nullable: false),
                    Number = table.Column<int>(type: "INTEGER", nullable: false),
                    SeatType = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Seats", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Seats_Auditoriums_AuditoriumId",
                        column: x => x.AuditoriumId,
                        principalTable: "Auditoriums",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Screenings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    MovieId = table.Column<int>(type: "INTEGER", nullable: false),
                    AuditoriumId = table.Column<int>(type: "INTEGER", nullable: false),
                    StartsAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    IsMatinee = table.Column<bool>(type: "INTEGER", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Screenings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Screenings_Auditoriums_AuditoriumId",
                        column: x => x.AuditoriumId,
                        principalTable: "Auditoriums",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Screenings_Movies_MovieId",
                        column: x => x.MovieId,
                        principalTable: "Movies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Orders",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    OrderNumber = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    CartToken = table.Column<string>(type: "TEXT", maxLength: 64, nullable: true),
                    ScreeningId = table.Column<int>(type: "INTEGER", nullable: false),
                    CustomerName = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    CustomerEmail = table.Column<string>(type: "TEXT", maxLength: 254, nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    TicketSubtotalCents = table.Column<int>(type: "INTEGER", nullable: false),
                    ConcessionSubtotalCents = table.Column<int>(type: "INTEGER", nullable: false),
                    DiscountCents = table.Column<int>(type: "INTEGER", nullable: false),
                    TaxCents = table.Column<int>(type: "INTEGER", nullable: false),
                    TotalCents = table.Column<int>(type: "INTEGER", nullable: false),
                    RefundedCents = table.Column<int>(type: "INTEGER", nullable: false),
                    PaymentReference = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    CancelledAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    CancelledBy = table.Column<string>(type: "TEXT", maxLength: 20, nullable: true),
                    CancellationReason = table.Column<string>(type: "TEXT", maxLength: 200, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Orders", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Orders_Screenings_ScreeningId",
                        column: x => x.ScreeningId,
                        principalTable: "Screenings",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SeatHolds",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    CartToken = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    ScreeningId = table.Column<int>(type: "INTEGER", nullable: false),
                    SeatId = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    ExpiresAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SeatHolds", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SeatHolds_Screenings_ScreeningId",
                        column: x => x.ScreeningId,
                        principalTable: "Screenings",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SeatHolds_Seats_SeatId",
                        column: x => x.SeatId,
                        principalTable: "Seats",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "OrderConcessionLines",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    OrderId = table.Column<int>(type: "INTEGER", nullable: false),
                    ConcessionItemId = table.Column<int>(type: "INTEGER", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 60, nullable: false),
                    UnitPriceCents = table.Column<int>(type: "INTEGER", nullable: false),
                    Quantity = table.Column<int>(type: "INTEGER", nullable: false),
                    LineTotalCents = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OrderConcessionLines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OrderConcessionLines_ConcessionItems_ConcessionItemId",
                        column: x => x.ConcessionItemId,
                        principalTable: "ConcessionItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OrderConcessionLines_Orders_OrderId",
                        column: x => x.OrderId,
                        principalTable: "Orders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Tickets",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    OrderId = table.Column<int>(type: "INTEGER", nullable: false),
                    ScreeningId = table.Column<int>(type: "INTEGER", nullable: false),
                    SeatId = table.Column<int>(type: "INTEGER", nullable: false),
                    TicketType = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    SeatType = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    BasePriceCents = table.Column<int>(type: "INTEGER", nullable: false),
                    DiscountCents = table.Column<int>(type: "INTEGER", nullable: false),
                    SurchargeCents = table.Column<int>(type: "INTEGER", nullable: false),
                    PriceCents = table.Column<int>(type: "INTEGER", nullable: false),
                    IsCancelled = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Tickets", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Tickets_Orders_OrderId",
                        column: x => x.OrderId,
                        principalTable: "Orders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Tickets_Screenings_ScreeningId",
                        column: x => x.ScreeningId,
                        principalTable: "Screenings",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Tickets_Seats_SeatId",
                        column: x => x.SeatId,
                        principalTable: "Seats",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Auditoriums_Name",
                table: "Auditoriums",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ConcessionItems_Name",
                table: "ConcessionItems",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Movies_Title",
                table: "Movies",
                column: "Title",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OrderConcessionLines_ConcessionItemId",
                table: "OrderConcessionLines",
                column: "ConcessionItemId");

            migrationBuilder.CreateIndex(
                name: "IX_OrderConcessionLines_OrderId",
                table: "OrderConcessionLines",
                column: "OrderId");

            migrationBuilder.CreateIndex(
                name: "IX_Orders_CartToken",
                table: "Orders",
                column: "CartToken",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Orders_CreatedAtUtc",
                table: "Orders",
                column: "CreatedAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_Orders_CustomerEmail",
                table: "Orders",
                column: "CustomerEmail");

            migrationBuilder.CreateIndex(
                name: "IX_Orders_OrderNumber",
                table: "Orders",
                column: "OrderNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Orders_ScreeningId",
                table: "Orders",
                column: "ScreeningId");

            migrationBuilder.CreateIndex(
                name: "IX_Screenings_AuditoriumId_StartsAtUtc",
                table: "Screenings",
                columns: new[] { "AuditoriumId", "StartsAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_Screenings_MovieId",
                table: "Screenings",
                column: "MovieId");

            migrationBuilder.CreateIndex(
                name: "IX_Screenings_StartsAtUtc",
                table: "Screenings",
                column: "StartsAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_SeatHolds_CartToken",
                table: "SeatHolds",
                column: "CartToken");

            migrationBuilder.CreateIndex(
                name: "IX_SeatHolds_ExpiresAtUtc",
                table: "SeatHolds",
                column: "ExpiresAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_SeatHolds_ScreeningId_SeatId",
                table: "SeatHolds",
                columns: new[] { "ScreeningId", "SeatId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SeatHolds_SeatId",
                table: "SeatHolds",
                column: "SeatId");

            migrationBuilder.CreateIndex(
                name: "IX_Seats_AuditoriumId_Row_Number",
                table: "Seats",
                columns: new[] { "AuditoriumId", "Row", "Number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Tickets_ActiveSeatPerScreening",
                table: "Tickets",
                columns: new[] { "ScreeningId", "SeatId" },
                unique: true,
                filter: "\"IsCancelled\" = 0");

            migrationBuilder.CreateIndex(
                name: "IX_Tickets_OrderId",
                table: "Tickets",
                column: "OrderId");

            migrationBuilder.CreateIndex(
                name: "IX_Tickets_SeatId",
                table: "Tickets",
                column: "SeatId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "OrderConcessionLines");

            migrationBuilder.DropTable(
                name: "SeatHolds");

            migrationBuilder.DropTable(
                name: "Tickets");

            migrationBuilder.DropTable(
                name: "ConcessionItems");

            migrationBuilder.DropTable(
                name: "Orders");

            migrationBuilder.DropTable(
                name: "Seats");

            migrationBuilder.DropTable(
                name: "Screenings");

            migrationBuilder.DropTable(
                name: "Auditoriums");

            migrationBuilder.DropTable(
                name: "Movies");
        }
    }
}
