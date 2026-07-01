using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace KanbanServer.Migrations
{
    /// <inheritdoc />
    public partial class FixTicketActualUniqueIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TicketActuals_TicketId_Date",
                table: "TicketActuals");

            migrationBuilder.CreateIndex(
                name: "IX_TicketActuals_TicketId_Date_ChildTaskIndex",
                table: "TicketActuals",
                columns: new[] { "TicketId", "Date", "ChildTaskIndex" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TicketActuals_TicketId_Date_ChildTaskIndex",
                table: "TicketActuals");

            migrationBuilder.CreateIndex(
                name: "IX_TicketActuals_TicketId_Date",
                table: "TicketActuals",
                columns: new[] { "TicketId", "Date" },
                unique: true);
        }
    }
}
