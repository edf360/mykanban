using Microsoft.Data.Sqlite;

var dbPath = Path.Combine("..", "..", "..", "..", "kanban.db");
Console.WriteLine($"Database path: {dbPath}");

using var conn = new SqliteConnection($"Data Source={dbPath}");
conn.Open();

// Create __EFMigrationsHistory table if not exists
var createHistoryCmd = conn.CreateCommand();
createHistoryCmd.CommandText = @"
CREATE TABLE IF NOT EXISTS ""__EFMigrationsHistory"" (
    ""MigrationId"" TEXT NOT NULL CONSTRAINT ""PK___EFMigrationsHistory"" PRIMARY KEY,
    ""ProductVersion"" TEXT NOT NULL
)";
createHistoryCmd.ExecuteNonQuery();
Console.WriteLine("Created __EFMigrationsHistory table");

// Insert existing migrations as applied
var migrations = new[]
{
    ("20260527144139_AddIsArchived", "10.0.8"),
    ("20260528121115_AddAssigneesJson", "10.0.8"),
    ("20260528121230_InitialCreate", "10.0.8"),
};

foreach (var (id, version) in migrations)
{
    var cmd = conn.CreateCommand();
    cmd.CommandText = @"INSERT OR IGNORE INTO ""__EFMigrationsHistory""(""MigrationId"", ""ProductVersion"") VALUES(@id, @ver)";
    cmd.Parameters.AddWithValue("@id", id);
    cmd.Parameters.AddWithValue("@ver", version);
    cmd.ExecuteNonQuery();
    Console.WriteLine($"Marked applied: {id}");
}

// Create TicketHistories table
var createCmd = conn.CreateCommand();
createCmd.CommandText = @"
CREATE TABLE IF NOT EXISTS ""TicketHistories"" (
    ""Id"" INTEGER NOT NULL CONSTRAINT ""PK_TicketHistories"" PRIMARY KEY AUTOINCREMENT,
    ""TicketId"" TEXT NOT NULL,
    ""Type"" TEXT NOT NULL,
    ""Value"" TEXT NULL,
    ""PreviousValue"" TEXT NULL,
    ""Date"" TEXT NOT NULL
)";
createCmd.ExecuteNonQuery();
Console.WriteLine("Created TicketHistories table");

// Insert migration record for AddTicketHistory
var migCmd = conn.CreateCommand();
migCmd.CommandText = @"INSERT OR IGNORE INTO ""__EFMigrationsHistory""(""MigrationId"", ""ProductVersion"") VALUES(@id, @ver)";
migCmd.Parameters.AddWithValue("@id", "20260528153813_AddTicketHistory");
migCmd.Parameters.AddWithValue("@ver", "10.0.8");
migCmd.ExecuteNonQuery();
Console.WriteLine("Marked applied: 20260528153813_AddTicketHistory");

// List all migrations
var listCmd = conn.CreateCommand();
listCmd.CommandText = @"SELECT ""MigrationId"" FROM ""__EFMigrationsHistory"" ORDER BY ""MigrationId""";
using var reader = listCmd.ExecuteReader();
Console.WriteLine("\nApplied migrations:");
while (reader.Read())
{
    Console.WriteLine($"  {reader.GetString(0)}");
}

Console.WriteLine("\nDone.");
