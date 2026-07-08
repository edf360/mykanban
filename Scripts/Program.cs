using Microsoft.Data.Sqlite;

var dbPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "..", "kanban.db");
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

// Add audit columns to Tickets table (skip if already applied)
var auditMigId = "20260601000000_AddAuditColumns";
var checkAuditCmd = conn.CreateCommand();
checkAuditCmd.CommandText = @"SELECT COUNT(1) FROM ""__EFMigrationsHistory"" WHERE ""MigrationId"" = @id";
checkAuditCmd.Parameters.AddWithValue("@id", auditMigId);
var auditApplied = (long)checkAuditCmd.ExecuteScalar() > 0;
// Check if Tickets table exists
var tableCheckCmd = conn.CreateCommand();
tableCheckCmd.CommandText = @"SELECT COUNT(1) FROM sqlite_master WHERE type='table' AND name='Tickets'";
var ticketsTableExists = (long)tableCheckCmd.ExecuteScalar() > 0;

if (!auditApplied && ticketsTableExists)
{
    var alterCmd = conn.CreateCommand();
    alterCmd.CommandText = @"
    ALTER TABLE ""Tickets"" ADD COLUMN ""CreatedBy"" TEXT NULL;
    ALTER TABLE ""Tickets"" ADD COLUMN ""UpdatedBy"" TEXT NULL;
    ALTER TABLE ""Tickets"" ADD COLUMN ""UpdatedAt"" TEXT NULL;
    ALTER TABLE ""Tickets"" ADD COLUMN ""DeletedAt"" TEXT NULL;
    ALTER TABLE ""Tickets"" ADD COLUMN ""IsDeleted"" INTEGER NOT NULL DEFAULT 0;
    ";
    alterCmd.ExecuteNonQuery();
    Console.WriteLine("Added audit columns to Tickets table");

    var migCmd2 = conn.CreateCommand();
    migCmd2.CommandText = @"INSERT OR IGNORE INTO ""__EFMigrationsHistory""(""MigrationId"", ""ProductVersion"") VALUES(@id, @ver)";
    migCmd2.Parameters.AddWithValue("@id", auditMigId);
    migCmd2.Parameters.AddWithValue("@ver", "10.0.8");
    migCmd2.ExecuteNonQuery();
    Console.WriteLine("Marked applied: " + auditMigId);
}
else
{
    if (!ticketsTableExists)
    {
        Console.WriteLine("Skipped: Tickets table does not exist");
    }
    else
    {
        Console.WriteLine("Skipped: Audit columns already applied");
    }
}

// Create TicketHistories table (skip if already applied)
var historyMigId = "20260528153813_AddTicketHistory";
var checkHistoryCmd = conn.CreateCommand();
checkHistoryCmd.CommandText = @"SELECT COUNT(1) FROM ""__EFMigrationsHistory"" WHERE ""MigrationId"" = @id";
checkHistoryCmd.Parameters.AddWithValue("@id", historyMigId);
var historyApplied = (long)checkHistoryCmd.ExecuteScalar() > 0;
if (!historyApplied)
{
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

    var migCmd = conn.CreateCommand();
    migCmd.CommandText = @"INSERT OR IGNORE INTO ""__EFMigrationsHistory""(""MigrationId"", ""ProductVersion"") VALUES(@id, @ver)";
    migCmd.Parameters.AddWithValue("@id", historyMigId);
    migCmd.Parameters.AddWithValue("@ver", "10.0.8");
    migCmd.ExecuteNonQuery();
    Console.WriteLine("Marked applied: " + historyMigId);
}
else
{
    Console.WriteLine("Skipped: TicketHistories already applied");
}

// Add CreatedAt and UpdatedAt to TicketActuals table (skip if already applied)
var actualsMigId = "20260601000001_AddTicketActualFields";
var checkActualsCmd = conn.CreateCommand();
checkActualsCmd.CommandText = @"SELECT COUNT(1) FROM ""__EFMigrationsHistory"" WHERE ""MigrationId"" = @id";
checkActualsCmd.Parameters.AddWithValue("@id", actualsMigId);
var actualsApplied = (long)checkActualsCmd.ExecuteScalar() > 0;
var actualsTableCheckCmd = conn.CreateCommand();
actualsTableCheckCmd.CommandText = @"SELECT COUNT(1) FROM sqlite_master WHERE type='table' AND name='TicketActuals'";
var actualsTableExists = (long)actualsTableCheckCmd.ExecuteScalar() > 0;

if (!actualsApplied && actualsTableExists)
{
    var alterActualsCmd = conn.CreateCommand();
    alterActualsCmd.CommandText = @"
    ALTER TABLE ""TicketActuals"" ADD COLUMN ""CreatedAt"" TEXT NULL;
    ALTER TABLE ""TicketActuals"" ADD COLUMN ""UpdatedAt"" TEXT NULL;
    ";
    try
    {
        alterActualsCmd.ExecuteNonQuery();
        Console.WriteLine("Added CreatedAt/UpdatedAt to TicketActuals table");
    }
    catch (SqliteException ex)
    {
        if (ex.Message.Contains("no such column"))
        {
            Console.WriteLine("CreatedAt/UpdatedAt already exist in TicketActuals");
        }
        else
        {
            throw;
        }
    }

    var migCmd3 = conn.CreateCommand();
    migCmd3.CommandText = @"INSERT OR IGNORE INTO ""__EFMigrationsHistory""(""MigrationId"", ""ProductVersion"") VALUES(@id, @ver)";
    migCmd3.Parameters.AddWithValue("@id", actualsMigId);
    migCmd3.Parameters.AddWithValue("@ver", "10.0.8");
    migCmd3.ExecuteNonQuery();
    Console.WriteLine("Marked applied: " + actualsMigId);
}
else
{
    if (!actualsTableExists)
    {
        Console.WriteLine("Skipped: TicketActuals table does not exist");
    }
    else
    {
        Console.WriteLine("Skipped: TicketActuals fields already applied");
    }
}

// Create ChildTasks table (skip if already applied)
var childTasksMigId = "20260601000002_CreateChildTasksTable";
var checkChildTasksCmd = conn.CreateCommand();
checkChildTasksCmd.CommandText = @"SELECT COUNT(1) FROM ""__EFMigrationsHistory"" WHERE ""MigrationId"" = @id";
checkChildTasksCmd.Parameters.AddWithValue("@id", childTasksMigId);
var childTasksApplied = (long)checkChildTasksCmd.ExecuteScalar() > 0;
if (!childTasksApplied)
{
    var createChildTasksCmd = conn.CreateCommand();
    createChildTasksCmd.CommandText = @"
    CREATE TABLE IF NOT EXISTS ""ChildTasks"" (
        ""Id"" TEXT NOT NULL CONSTRAINT ""PK_ChildTasks"" PRIMARY KEY,
        ""TicketId"" TEXT NOT NULL,
        ""Text"" TEXT NOT NULL,
        ""Done"" INTEGER NOT NULL DEFAULT 0,
        ""Progress"" INTEGER NOT NULL DEFAULT 0,
        ""Category"" TEXT NULL,
        ""Memo"" TEXT NULL,
        ""ReviewState"" TEXT NOT NULL DEFAULT 'none',
        ""OrderIndex"" INTEGER NOT NULL DEFAULT 0,
        ""CreatedAt"" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ""UpdatedAt"" TEXT NULL
    )";
    createChildTasksCmd.ExecuteNonQuery();
    Console.WriteLine("Created ChildTasks table");

    // Create index on TicketId
    var createIndexCmd = conn.CreateCommand();
    createIndexCmd.CommandText = @"
    CREATE INDEX IF NOT EXISTS ""IX_ChildTasks_TicketId"" ON ""ChildTasks""(""TicketId"")";
    createIndexCmd.ExecuteNonQuery();
    Console.WriteLine("Created index on ChildTasks.TicketId");

    var migCmd4 = conn.CreateCommand();
    migCmd4.CommandText = @"INSERT OR IGNORE INTO ""__EFMigrationsHistory""(""MigrationId"", ""ProductVersion"") VALUES(@id, @ver)";
    migCmd4.Parameters.AddWithValue("@id", childTasksMigId);
    migCmd4.Parameters.AddWithValue("@ver", "10.0.8");
    migCmd4.ExecuteNonQuery();
    Console.WriteLine("Marked applied: " + childTasksMigId);
}
else
{
    Console.WriteLine("Skipped: ChildTasks table already applied");
}

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
