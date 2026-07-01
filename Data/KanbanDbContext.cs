using KanbanServer.Models;
using Microsoft.EntityFrameworkCore;

namespace KanbanServer.Data;

public class KanbanDbContext : DbContext
{
    public DbSet<Ticket> Tickets => Set<Ticket>();
    public DbSet<TicketHistory> TicketHistories => Set<TicketHistory>();
    public DbSet<TicketActual> TicketActuals => Set<TicketActual>();
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
            // Id は DB 上の AUTOINCREMENT 列だが、主キーは TicketId
            entity.Property(e => e.Id).ValueGeneratedOnAdd();
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
            // 外部キー制約を追加
            entity.HasOne<Ticket>()
                .WithMany()
                .HasForeignKey(e => e.TicketId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<TicketActual>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TicketId).IsRequired();
            entity.Property(e => e.Date).IsRequired();
            // TicketId + Date + ChildTaskIndex の複合ユニーク制約
            entity.HasIndex(e => new { e.TicketId, e.Date, e.ChildTaskIndex }).IsUnique();
            // 外部キー制約 - チケット削除時に連動削除
            entity.HasOne<Ticket>()
                .WithMany()
                .HasForeignKey(e => e.TicketId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Setting>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.UsersJson).HasDefaultValue("[]");
            entity.Property(e => e.LabelsJson).HasDefaultValue("[]");
            entity.Property(e => e.HolidaysJson).HasDefaultValue("[]");
            entity.Property(e => e.MemosJson).HasDefaultValue("{}");
            // Dictionary プロパティはナビゲーションプロパティとして認識されないよう無視
            entity.Ignore(e => e.Memos);
        });
    }
}
