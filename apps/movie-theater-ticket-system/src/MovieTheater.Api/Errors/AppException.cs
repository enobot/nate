namespace MovieTheater.Api.Errors;

/// <summary>
/// A business-rule failure that maps to a ProblemDetails response. The message is safe to show
/// to users; it never contains stack traces or SQL.
/// </summary>
public class AppException(int statusCode, string code, string title, string detail) : Exception(detail)
{
    public int StatusCode { get; } = statusCode;

    /// <summary>Stable machine-readable code the client can branch on, e.g. "seat-unavailable".</summary>
    public string Code { get; } = code;

    public string Title { get; } = title;
}

public sealed class NotFoundException(string detail)
    : AppException(StatusCodes.Status404NotFound, "not-found", "Not found", detail);

public sealed class ConflictException(string code, string detail)
    : AppException(StatusCodes.Status409Conflict, code, "Conflict", detail);

public sealed class BadRequestException(string code, string detail)
    : AppException(StatusCodes.Status400BadRequest, code, "Invalid request", detail);
