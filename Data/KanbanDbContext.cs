using KanbanServer.Models;
using Microsoft.EntityFrameworkCore;

namespace KanbanServer.Data;

public class KanbanDbContext : DbContext
{
    public DbSet<Ticket> Tickets => Set<Ticket>();
    public DbSet<TicketHistory> TicketHistories => Set<TicketHistory>();
    public DbSet<Setting> Settings => Set<Setting>();

    public KanbanDbContext(DbContextOptions<KanbanDbContext> options) : base(options)
    {
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // ChildTask/LabelConfigはエンティティとして扱わない（JSONフィールド用）
        modelBuilder.Ignore<ChildTask>();
        modelBuilder.Ignore<LabelConfig>();

        modelBuilder.Entity<Ticket>(entity =>
        {
            entity.HasKey(e => e.TicketId);
            entity.Property(e => e.TicketId).ValueGeneratedOnAdd();
            entity.Property(e => e.Title).IsRequired();
            entity.Property(e => e.Column).HasDefaultValue("todo");
            entity.Property(e => e.AssigneesJson).HasDefaultValue("[]");
            entity.Property(e => e.LabelsJson).HasDefaultValue("[]");
            entity.Property(e => e.ChildTasksJson).HasDefaultValue("[]");
            entity.Property(e => e.IsArchived).HasDefaultValue(false);
        });

        modelBuilder.Entity<TicketHistory>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TicketId).IsRequired();
            entity.Property(e => e.Type).IsRequired();
        });

        modelBuilder.Entity<Setting>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.UsersJson).HasDefaultValue("[]");
            entity.Property(e => e.LabelsJson).HasDefaultValue("[]");
            entity.Property(e => e.HolidaysJson).HasDefaultValue("[]");
        });
    }
}
