using KanbanServer.Models;
using Microsoft.EntityFrameworkCore;

namespace KanbanServer.Data;

public class KanbanDbContext : DbContext
{
    public DbSet<Ticket> Tickets => Set<Ticket>();
    public DbSet<TicketActual> TicketActuals => Set<TicketActual>();
    public DbSet<ChildTask> ChildTasks => Set<ChildTask>();
    public DbSet<Setting> Settings => Set<Setting>();
    public DbSet<TicketAssignee> TicketAssignees => Set<TicketAssignee>();
    public DbSet<TicketLabel> TicketLabels => Set<TicketLabel>();

    public KanbanDbContext(DbContextOptions<KanbanDbContext> options) : base(options)
    {
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // LabelConfigはエンティティとして扱わない（JSONフィールド用）
        modelBuilder.Ignore<LabelConfig>();

        modelBuilder.Entity<Ticket>(entity =>
        {
            entity.HasKey(e => e.TicketId);
            entity.Property(e => e.Title).IsRequired();
            entity.Property(e => e.Column).HasDefaultValue("todo");
            entity.Property(e => e.IsArchived).HasDefaultValue(false);
            entity.Property(e => e.Progress).HasDefaultValue(0);
            entity.Property(e => e.IsDeleted).HasDefaultValue(false);

            // ソフト削除のGlobal Query Filter
            entity.HasQueryFilter(e => !e.IsDeleted);

            // インデックス
            entity.HasIndex(e => e.Column);
            entity.HasIndex(e => e.CreatedAt);
            entity.HasIndex(e => e.IsArchived);
            entity.HasIndex(e => e.IsDeleted);

            // 子タスクとの関連
            entity.HasMany(t => t.ChildTasksEntities)
                .WithOne(ct => ct.Ticket!)
                .HasForeignKey(ct => ct.TicketId)
                .OnDelete(DeleteBehavior.Cascade);

            // 担当者との関連
            entity.HasMany(t => t.TicketAssignees)
                .WithOne(ta => ta.Ticket!)
                .HasForeignKey(ta => ta.TicketId)
                .OnDelete(DeleteBehavior.Cascade);

            // ラベルとの関連
            entity.HasMany(t => t.TicketLabels)
                .WithOne(tl => tl.Ticket!)
                .HasForeignKey(tl => tl.TicketId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<TicketAssignee>(entity =>
        {
            entity.HasKey(e => new { e.TicketId, e.Assignee });
            entity.Property(e => e.IsPrimary).HasDefaultValue(false);
        });

        modelBuilder.Entity<TicketLabel>(entity =>
        {
            entity.HasKey(e => new { e.TicketId, e.Label });
        });

        modelBuilder.Entity<TicketActual>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TicketId).IsRequired();
            entity.Property(e => e.Date).IsRequired();
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            // TicketId + Date + ChildTaskIndex の複合ユニーク制約（旧互換）
            entity.HasIndex(e => new { e.TicketId, e.Date, e.ChildTaskIndex }).IsUnique();
            // TicketId + Date + ChildTaskId の複合ユニーク制約（新）
            entity.HasIndex(e => new { e.TicketId, e.Date, e.ChildTaskId }).IsUnique();
        });

        modelBuilder.Entity<ChildTask>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Text).IsRequired();
            entity.Property(e => e.TicketId).IsRequired();
            entity.Property(e => e.ReviewState).HasDefaultValue("none");
            entity.Property(e => e.Progress).HasDefaultValue(0);
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");

            // インデックス
            entity.HasIndex(e => e.TicketId);
            entity.HasIndex(e => e.OrderIndex);
            // 関係はTicket側で定義されているためここでは設定しない
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
