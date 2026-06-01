using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace KanbanServer.Migrations
{
    /// <inheritdoc />
    public partial class InitialHistoryRedesign : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Settings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    UsersJson = table.Column<string>(type: "TEXT", nullable: false, defaultValue: "[]"),
                    LabelsJson = table.Column<string>(type: "TEXT", nullable: false, defaultValue: "[]"),
                    HolidaysJson = table.Column<string>(type: "TEXT", nullable: false, defaultValue: "[]"),
                    Users = table.Column<string>(type: "TEXT", nullable: false),
                    Holidays = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Settings", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "TicketHistories",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    TicketId = table.Column<string>(type: "TEXT", nullable: false),
                    Type = table.Column<string>(type: "TEXT", nullable: false),
                    Value = table.Column<string>(type: "TEXT", nullable: true),
                    PreviousValue = table.Column<string>(type: "TEXT", nullable: true),
                    Date = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TicketHistories", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Tickets",
                columns: table => new
                {
                    TicketId = table.Column<string>(type: "TEXT", nullable: false),
                    Id = table.Column<int>(type: "INTEGER", nullable: false),
                    Title = table.Column<string>(type: "TEXT", nullable: false),
                    IsArchived = table.Column<bool>(type: "INTEGER", nullable: false, defaultValue: false),
                    Column = table.Column<string>(type: "TEXT", nullable: false, defaultValue: "todo"),
                    Position = table.Column<int>(type: "INTEGER", nullable: false),
                    Progress = table.Column<int>(type: "INTEGER", nullable: false),
                    StartDate = table.Column<DateTime>(type: "TEXT", nullable: true),
                    EndDate = table.Column<DateTime>(type: "TEXT", nullable: true),
                    Effort = table.Column<int>(type: "INTEGER", nullable: true),
                    AssigneesJson = table.Column<string>(type: "TEXT", nullable: false, defaultValue: "[]"),
                    LabelsJson = table.Column<string>(type: "TEXT", nullable: false, defaultValue: "[]"),
                    Assignees = table.Column<string>(type: "TEXT", nullable: false),
                    MainAssignee = table.Column<string>(type: "TEXT", nullable: true),
                    Memo = table.Column<string>(type: "TEXT", nullable: false),
                    ChildTasksJson = table.Column<string>(type: "TEXT", nullable: false, defaultValue: "[]"),
                    Labels = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Tickets", x => x.TicketId);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Settings");

            migrationBuilder.DropTable(
                name: "TicketHistories");

            migrationBuilder.DropTable(
                name: "Tickets");
        }
    }
}
