using ItAssetTracker.Api.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace ItAssetTracker.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Location> Locations => Set<Location>();
    public DbSet<Person> People => Set<Person>();
    public DbSet<Asset> Assets => Set<Asset>();
    public DbSet<AssetHistory> AssetHistory => Set<AssetHistory>();
    public DbSet<Vlan> Vlans => Set<Vlan>();
    public DbSet<NetworkSwitch> NetworkSwitches => Set<NetworkSwitch>();
    public DbSet<SwitchPort> SwitchPorts => Set<SwitchPort>();
    public DbSet<NetworkJack> NetworkJacks => Set<NetworkJack>();
    public DbSet<ServiceRequest> ServiceRequests => Set<ServiceRequest>();
    public DbSet<TicketEvent> TicketEvents => Set<TicketEvent>();

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        // Store every enum as its name so SQL reports can filter on readable values.
        configurationBuilder.Properties<Enum>().HaveConversion<string>().HaveMaxLength(20);

        // SQLite has no time zone type. Everything is written as UTC, and this converter marks
        // values read back as UTC so the JSON output ends in "Z" and browsers convert correctly.
        configurationBuilder.Properties<DateTime>().HaveConversion<UtcDateTimeConverter>();
        configurationBuilder.Properties<DateTime?>().HaveConversion<UtcDateTimeConverter>();
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Location>(e =>
        {
            e.ToTable("Locations");
            e.Property(x => x.BuildingCode).HasMaxLength(10);
            e.Property(x => x.Building).HasMaxLength(80);
            e.Property(x => x.Room).HasMaxLength(20);
            e.Property(x => x.Description).HasMaxLength(200);
            e.HasIndex(x => new { x.BuildingCode, x.Room }).IsUnique();
            e.Ignore(x => x.DisplayName);
        });

        modelBuilder.Entity<Person>(e =>
        {
            e.ToTable("People");
            e.Property(x => x.FirstName).HasMaxLength(50);
            e.Property(x => x.LastName).HasMaxLength(50);
            e.Property(x => x.Email).HasMaxLength(120);
            e.Property(x => x.Department).HasMaxLength(80);
            e.Property(x => x.JobTitle).HasMaxLength(80);
            e.HasIndex(x => x.Email).IsUnique();
            e.Ignore(x => x.FullName);
        });

        modelBuilder.Entity<Asset>(e =>
        {
            e.ToTable("Assets");
            e.Property(x => x.AssetTag).HasMaxLength(20);
            e.Property(x => x.Manufacturer).HasMaxLength(60);
            e.Property(x => x.Model).HasMaxLength(80);
            e.Property(x => x.SerialNumber).HasMaxLength(40);
            e.Property(x => x.Notes).HasMaxLength(1000);
            e.Property(x => x.Version).IsConcurrencyToken();

            // Unique indexes are the final guarantee against duplicates, even if two
            // requests pass the service-layer check at the same moment.
            e.HasIndex(x => x.AssetTag).IsUnique();
            e.HasIndex(x => x.SerialNumber).IsUnique();
            e.HasIndex(x => x.Status);
            e.HasIndex(x => x.WarrantyEndDate);

            e.HasOne(x => x.Location).WithMany().HasForeignKey(x => x.LocationId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.AssignedTo).WithMany().HasForeignKey(x => x.AssignedToPersonId).OnDelete(DeleteBehavior.Restrict);
            e.HasMany(x => x.History).WithOne(h => h.Asset).HasForeignKey(h => h.AssetId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AssetHistory>(e =>
        {
            e.ToTable("AssetHistory");
            e.Property(x => x.FromStatus).HasMaxLength(20);
            e.Property(x => x.ToStatus).HasMaxLength(20);
            e.Property(x => x.FromAssignee).HasMaxLength(110);
            e.Property(x => x.ToAssignee).HasMaxLength(110);
            e.Property(x => x.FromLocation).HasMaxLength(40);
            e.Property(x => x.ToLocation).HasMaxLength(40);
            e.Property(x => x.Note).HasMaxLength(300);
            e.HasIndex(x => new { x.AssetId, x.ChangedAt });
        });

        modelBuilder.Entity<Vlan>(e =>
        {
            e.ToTable("Vlans", t => t.HasCheckConstraint("CK_Vlans_VlanId_Range", "VlanId BETWEEN 1 AND 4094"));
            e.HasKey(x => x.VlanId);
            e.Property(x => x.VlanId).ValueGeneratedNever();
            e.Property(x => x.Name).HasMaxLength(40);
            e.Property(x => x.Description).HasMaxLength(200);
            e.HasIndex(x => x.Name).IsUnique();
        });

        modelBuilder.Entity<NetworkSwitch>(e =>
        {
            e.ToTable("NetworkSwitches");
            e.Property(x => x.Name).HasMaxLength(40);
            e.Property(x => x.Model).HasMaxLength(60);
            e.Property(x => x.ManagementIp).HasMaxLength(15);
            e.HasIndex(x => x.Name).IsUnique();
            e.HasIndex(x => x.ManagementIp).IsUnique();
            e.HasOne(x => x.Location).WithMany().HasForeignKey(x => x.LocationId).OnDelete(DeleteBehavior.Restrict);
            e.HasMany(x => x.Ports).WithOne(p => p.Switch).HasForeignKey(p => p.SwitchId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<SwitchPort>(e =>
        {
            e.ToTable("SwitchPorts", t => t.HasCheckConstraint("CK_SwitchPorts_VlanId_Range", "VlanId IS NULL OR VlanId BETWEEN 1 AND 4094"));
            e.Property(x => x.PortName).HasMaxLength(12);

            // Existing rows (and inserts from older code) default to Access.
            e.Property(x => x.Role).HasDefaultValue(PortRole.Access).HasSentinel(PortRole.Access);
            e.Property(x => x.Description).HasMaxLength(100);
            e.HasIndex(x => new { x.SwitchId, x.PortName }).IsUnique();
            e.HasOne(x => x.Vlan).WithMany().HasForeignKey(x => x.VlanId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<NetworkJack>(e =>
        {
            e.ToTable("NetworkJacks");
            e.Property(x => x.Label).HasMaxLength(20);
            e.Property(x => x.Notes).HasMaxLength(500);
            e.HasIndex(x => new { x.LocationId, x.Label }).IsUnique();

            // One jack per port. Filtered so that any number of jacks can be unpatched (NULL).
            e.HasIndex(x => x.SwitchPortId).IsUnique().HasFilter("SwitchPortId IS NOT NULL");

            e.HasOne(x => x.Location).WithMany().HasForeignKey(x => x.LocationId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.SwitchPort).WithOne(p => p.Jack).HasForeignKey<NetworkJack>(x => x.SwitchPortId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ServiceRequest>(e =>
        {
            e.ToTable("ServiceRequests");
            e.Property(x => x.Title).HasMaxLength(120);
            e.Property(x => x.Description).HasMaxLength(4000);
            e.Property(x => x.ResolutionNotes).HasMaxLength(2000);
            e.Property(x => x.Version).IsConcurrencyToken();
            e.Ignore(x => x.Number);
            e.HasIndex(x => x.Status);
            e.HasIndex(x => x.Priority);
            e.HasIndex(x => x.CreatedAt);
            e.HasIndex(x => x.AssigneeId);
            e.HasOne(x => x.Requester).WithMany().HasForeignKey(x => x.RequesterId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Assignee).WithMany().HasForeignKey(x => x.AssigneeId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.RelatedAsset).WithMany().HasForeignKey(x => x.RelatedAssetId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.RelatedJack).WithMany().HasForeignKey(x => x.RelatedJackId).OnDelete(DeleteBehavior.Restrict);
            e.HasMany(x => x.Events).WithOne(t => t.ServiceRequest).HasForeignKey(t => t.ServiceRequestId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<TicketEvent>(e =>
        {
            e.ToTable("TicketEvents");
            e.Property(x => x.ActorName).HasMaxLength(110);
            e.Property(x => x.FromStatus).HasMaxLength(20);
            e.Property(x => x.ToStatus).HasMaxLength(20);
            e.Property(x => x.FromAssignee).HasMaxLength(110);
            e.Property(x => x.ToAssignee).HasMaxLength(110);
            e.Property(x => x.Text).HasMaxLength(2000);
            e.HasIndex(x => new { x.ServiceRequestId, x.CreatedAt });
            e.HasOne<Person>().WithMany().HasForeignKey(x => x.ActorId).OnDelete(DeleteBehavior.SetNull);
        });
    }
}

/// <summary>Writes DateTime values as UTC and reads them back with DateTimeKind.Utc.</summary>
public sealed class UtcDateTimeConverter() : ValueConverter<DateTime, DateTime>(
    v => v.Kind == DateTimeKind.Utc ? v : v.ToUniversalTime(),
    v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
