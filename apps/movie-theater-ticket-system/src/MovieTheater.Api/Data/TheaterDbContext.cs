using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using MovieTheater.Api.Domain;

namespace MovieTheater.Api.Data;

public class TheaterDbContext(DbContextOptions<TheaterDbContext> options) : DbContext(options)
{
    public DbSet<Movie> Movies => Set<Movie>();
    public DbSet<Auditorium> Auditoriums => Set<Auditorium>();
    public DbSet<Seat> Seats => Set<Seat>();
    public DbSet<Screening> Screenings => Set<Screening>();
    public DbSet<SeatHold> SeatHolds => Set<SeatHold>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<Ticket> Tickets => Set<Ticket>();
    public DbSet<ConcessionItem> ConcessionItems => Set<ConcessionItem>();
    public DbSet<OrderConcessionLine> OrderConcessionLines => Set<OrderConcessionLine>();

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        // SQLite has no native date type. Values are stored as ISO-8601 text in UTC and marked as UTC
        // when read back, so JSON responses always carry the "Z" suffix.
        configurationBuilder.Properties<DateTime>().HaveConversion<UtcDateTimeConverter>();
        configurationBuilder.Properties<DateTime?>().HaveConversion<UtcDateTimeConverter>();

        // Enums are stored as readable text instead of numbers.
        configurationBuilder.Properties<SeatType>().HaveConversion<string>().HaveMaxLength(20);
        configurationBuilder.Properties<TicketType>().HaveConversion<string>().HaveMaxLength(20);
        configurationBuilder.Properties<OrderStatus>().HaveConversion<string>().HaveMaxLength(20);
        configurationBuilder.Properties<CancellationSource>().HaveConversion<string>().HaveMaxLength(20);
        configurationBuilder.Properties<ConcessionCategory>().HaveConversion<string>().HaveMaxLength(20);
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Movie>(e =>
        {
            e.Property(m => m.Title).HasMaxLength(120).UseCollation("NOCASE");
            e.HasIndex(m => m.Title).IsUnique();
            e.Property(m => m.Tagline).HasMaxLength(160);
            e.Property(m => m.Synopsis).HasMaxLength(1200);
            e.Property(m => m.Genre).HasMaxLength(40);
            e.Property(m => m.Rating).HasMaxLength(10);
            e.Property(m => m.PosterPalette).HasMaxLength(20);
            e.Property(m => m.PosterMotif).HasMaxLength(20);
        });

        modelBuilder.Entity<Auditorium>(e =>
        {
            e.Property(a => a.Name).HasMaxLength(60);
            e.HasIndex(a => a.Name).IsUnique();
            e.Property(a => a.AisleAfter).HasMaxLength(60);
        });

        modelBuilder.Entity<Seat>(e =>
        {
            e.Property(s => s.Row).HasMaxLength(2);
            e.HasIndex(s => new { s.AuditoriumId, s.Row, s.Number }).IsUnique();
            e.HasOne(s => s.Auditorium).WithMany(a => a.Seats).HasForeignKey(s => s.AuditoriumId).OnDelete(DeleteBehavior.Cascade);
            e.Ignore(s => s.Label);
        });

        modelBuilder.Entity<Screening>(e =>
        {
            e.HasIndex(s => new { s.AuditoriumId, s.StartsAtUtc });
            e.HasIndex(s => s.StartsAtUtc);
            e.HasOne(s => s.Movie).WithMany(m => m.Screenings).HasForeignKey(s => s.MovieId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(s => s.Auditorium).WithMany().HasForeignKey(s => s.AuditoriumId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<SeatHold>(e =>
        {
            e.Property(h => h.CartToken).HasMaxLength(64);

            // Only one cart can hold a given seat for a given screening.
            e.HasIndex(h => new { h.ScreeningId, h.SeatId }).IsUnique();
            e.HasIndex(h => h.CartToken);
            e.HasIndex(h => h.ExpiresAtUtc);
            e.HasOne(h => h.Screening).WithMany(s => s.Holds).HasForeignKey(h => h.ScreeningId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(h => h.Seat).WithMany().HasForeignKey(h => h.SeatId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Order>(e =>
        {
            e.Property(o => o.OrderNumber).HasMaxLength(20);
            e.HasIndex(o => o.OrderNumber).IsUnique();
            e.Property(o => o.CartToken).HasMaxLength(64);

            // Makes checkout idempotent: one order per cart.
            e.HasIndex(o => o.CartToken).IsUnique();
            e.Property(o => o.CustomerName).HasMaxLength(80);
            e.Property(o => o.CustomerEmail).HasMaxLength(254);
            e.HasIndex(o => o.CustomerEmail);
            e.HasIndex(o => o.CreatedAtUtc);
            e.Property(o => o.PaymentReference).HasMaxLength(40);
            e.Property(o => o.CancellationReason).HasMaxLength(200);
            e.HasOne(o => o.Screening).WithMany().HasForeignKey(o => o.ScreeningId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Ticket>(e =>
        {
            // The core double-booking guarantee: an active (not cancelled) ticket for a seat can exist
            // only once per screening. SQLite supports this as a partial unique index.
            e.HasIndex(t => new { t.ScreeningId, t.SeatId })
                .IsUnique()
                .HasFilter("\"IsCancelled\" = 0")
                .HasDatabaseName("IX_Tickets_ActiveSeatPerScreening");
            e.HasIndex(t => t.OrderId);
            e.HasOne(t => t.Order).WithMany(o => o.Tickets).HasForeignKey(t => t.OrderId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(t => t.Screening).WithMany(s => s.Tickets).HasForeignKey(t => t.ScreeningId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(t => t.Seat).WithMany().HasForeignKey(t => t.SeatId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ConcessionItem>(e =>
        {
            e.Property(c => c.Name).HasMaxLength(60);
            e.HasIndex(c => c.Name).IsUnique();
            e.Property(c => c.Description).HasMaxLength(200);
        });

        modelBuilder.Entity<OrderConcessionLine>(e =>
        {
            e.Property(l => l.Name).HasMaxLength(60);
            e.HasOne(l => l.Order).WithMany(o => o.ConcessionLines).HasForeignKey(l => l.OrderId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(l => l.ConcessionItem).WithMany().HasForeignKey(l => l.ConcessionItemId).OnDelete(DeleteBehavior.Restrict);
        });
    }

    /// <summary>True when a save failed because a UNIQUE index (or primary key) rejected the row.</summary>
    public static bool IsUniqueViolation(DbUpdateException exception) =>
        exception.InnerException is SqliteException { SqliteErrorCode: 19 } sqlite
        && sqlite.SqliteExtendedErrorCode is 2067 or 1555;

    internal sealed class UtcDateTimeConverter() : ValueConverter<DateTime, DateTime>(
        v => v.Kind == DateTimeKind.Utc ? v : v.ToUniversalTime(),
        v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
}
