using ItAssetTracker.Api.Domain;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace ItAssetTracker.Api.Infrastructure;

/// <summary>
/// Turns domain exceptions and database constraint failures into RFC 9457 ProblemDetails responses.
/// Anything not recognised here falls through to the default handler, which returns a generic 500
/// without the stack trace.
/// </summary>
public sealed class ProblemExceptionHandler(IProblemDetailsService problemDetailsService, ILogger<ProblemExceptionHandler> logger)
    : IExceptionHandler
{
    // SQLITE_CONSTRAINT primary result code. Covers UNIQUE, FOREIGN KEY and CHECK violations.
    private const int SqliteConstraintError = 19;

    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        ProblemDetails? problem = exception switch
        {
            BusinessRuleException rule => new ValidationProblemDetails(rule.Errors.ToDictionary(e => e.Key, e => e.Value))
            {
                Status = StatusCodes.Status400BadRequest,
                Title = "One or more validation errors occurred.",
                Detail = rule.Message
            },
            NotFoundException notFound => new ProblemDetails
            {
                Status = StatusCodes.Status404NotFound,
                Title = "Not found",
                Detail = notFound.Message
            },
            ConflictException conflict => new ProblemDetails
            {
                Status = StatusCodes.Status409Conflict,
                Title = "Conflict",
                Detail = conflict.Message
            },
            DbUpdateConcurrencyException => new ProblemDetails
            {
                Status = StatusCodes.Status409Conflict,
                Title = "Conflict",
                Detail = "This record was changed by someone else after you loaded it. Reload and try again."
            },
            DbUpdateException { InnerException: SqliteException { SqliteErrorCode: SqliteConstraintError } } => new ProblemDetails
            {
                Status = StatusCodes.Status409Conflict,
                Title = "Conflict",
                Detail = "The change conflicts with existing data (duplicate value or record still in use)."
            },
            _ => null
        };

        if (problem is null)
        {
            return false;
        }

        if (exception is DbUpdateException)
        {
            logger.LogWarning(exception, "Database rejected a write");
        }

        httpContext.Response.StatusCode = problem.Status!.Value;
        return await problemDetailsService.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails = problem,
            Exception = exception
        });
    }
}
