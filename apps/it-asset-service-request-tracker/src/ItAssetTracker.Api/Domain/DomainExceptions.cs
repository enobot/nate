namespace ItAssetTracker.Api.Domain;

/// <summary>Base type for errors that map to a specific HTTP status in ProblemExceptionHandler.</summary>
public abstract class DomainException(string message) : Exception(message);

/// <summary>Input breaks a business rule (HTTP 400). Field names match the request body properties.</summary>
public sealed class BusinessRuleException : DomainException
{
    public BusinessRuleException(string field, string message) : base(message)
    {
        Errors = new Dictionary<string, string[]> { [field] = [message] };
    }

    public BusinessRuleException(IDictionary<string, string[]> errors)
        : base(string.Join(" ", errors.SelectMany(e => e.Value)))
    {
        Errors = new Dictionary<string, string[]>(errors);
    }

    public IReadOnlyDictionary<string, string[]> Errors { get; }
}

/// <summary>The request conflicts with the current state of the data (HTTP 409).</summary>
public sealed class ConflictException(string message) : DomainException(message);

/// <summary>The requested resource does not exist (HTTP 404).</summary>
public sealed class NotFoundException(string message) : DomainException(message);
