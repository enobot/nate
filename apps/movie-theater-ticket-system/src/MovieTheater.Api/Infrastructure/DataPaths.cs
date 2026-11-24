using Microsoft.AspNetCore.DataProtection.KeyManagement;
using Microsoft.AspNetCore.DataProtection.Repositories;
using Microsoft.AspNetCore.DataProtection.XmlEncryption;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Options;
using MovieTheater.Api.Options;

namespace MovieTheater.Api.Infrastructure;

/// <summary>
/// Resolves where local data lives: the SQLite file and the data protection keys that sign the
/// admin cookie. Everything stays inside the project's App_Data folder (gitignored) unless
/// configuration points somewhere else.
/// </summary>
public sealed class DataPaths
{
    public DataPaths(IOptions<StorageOptions> storage, IConfiguration configuration, IWebHostEnvironment environment)
    {
        var dir = storage.Value.DataDirectory;
        DataDirectory = Path.IsPathRooted(dir) ? dir : Path.Combine(environment.ContentRootPath, dir);
        Directory.CreateDirectory(DataDirectory);
        KeysDirectory = Path.Combine(DataDirectory, "keys");

        var configured = configuration.GetConnectionString("Theater");
        ConnectionString = string.IsNullOrWhiteSpace(configured)
            ? new SqliteConnectionStringBuilder { DataSource = Path.Combine(DataDirectory, storage.Value.DatabaseFileName) }.ToString()
            : configured;
    }

    public string DataDirectory { get; }
    public string KeysDirectory { get; }
    public string ConnectionString { get; }
}

/// <summary>Stores data protection keys under <see cref="DataPaths.KeysDirectory"/>, encrypted with DPAPI on Windows.</summary>
public sealed class LocalKeyStorageSetup(DataPaths paths, ILoggerFactory loggerFactory) : IConfigureOptions<KeyManagementOptions>
{
    public void Configure(KeyManagementOptions options)
    {
        options.XmlRepository = new FileSystemXmlRepository(new DirectoryInfo(paths.KeysDirectory), loggerFactory);
        if (OperatingSystem.IsWindows())
        {
            options.XmlEncryptor = new DpapiXmlEncryptor(protectToLocalMachine: false, loggerFactory);
        }
    }
}
