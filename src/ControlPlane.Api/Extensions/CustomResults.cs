using ControlPlane.Domain.Abstractions;

namespace ControlPlane.Api.Extensions;

/// <summary>Centralizes the <see cref="Error"/> -&gt; <see cref="ProblemDetails"/> mapping.</summary>
public static class CustomResults
{
    public static IResult Problem(Error error)
    {
        int statusCode = error.Type switch
        {
            ErrorType.Validation => StatusCodes.Status400BadRequest,
            ErrorType.NotFound => StatusCodes.Status404NotFound,
            ErrorType.Conflict => StatusCodes.Status409Conflict,
            ErrorType.Problem => StatusCodes.Status400BadRequest,
            ErrorType.Failure => StatusCodes.Status500InternalServerError,
            _ => StatusCodes.Status500InternalServerError,
        };

        return Results.Problem(
            statusCode: statusCode,
            title: error.Code,
            detail: error.Description,
            extensions: new Dictionary<string, object?> { { "errors", new[] { error } } });
    }
}
