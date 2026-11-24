using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace MovieTheater.Api.Errors;

/// <summary>
/// Turns <see cref="AppException"/> into an RFC 9457 ProblemDetails response.
/// Any other exception falls through to the default handler, which returns a generic 500
/// ProblemDetails without internal details.
/// </summary>
public sealed class AppExceptionHandler(IProblemDetailsService problemDetails, ILogger<AppExceptionHandler> logger)
    : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        if (exception is not AppException app)
        {
            logger.LogError(exception, "Unhandled exception for {Method} {Path}", httpContext.Request.Method, httpContext.Request.Path);
            return false;
        }

        httpContext.Response.StatusCode = app.StatusCode;
        var problem = new ProblemDetails
        {
            Status = app.StatusCode,
            Title = app.Title,
            Detail = app.Message,
        };
        problem.Extensions["code"] = app.Code;

        return await problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails = problem,
            Exception = exception,
        });
    }
}
