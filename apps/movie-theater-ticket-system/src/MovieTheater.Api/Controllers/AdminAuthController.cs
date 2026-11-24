using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using MovieTheater.Api.Contracts;
using MovieTheater.Api.Infrastructure;

namespace MovieTheater.Api.Controllers;

[ApiController]
[Route("api/admin/auth")]
public sealed class AdminAuthController(DemoAdminAuthenticator authenticator, ILogger<AdminAuthController> logger) : ControllerBase
{
    /// <summary>Signs in the demo admin and sets an HttpOnly, SameSite=Strict auth cookie.</summary>
    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimitPolicies.Login)]
    [ProducesResponseType<AdminUserDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status429TooManyRequests)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<AdminUserDto>> Login(LoginRequest request)
    {
        if (!authenticator.IsConfigured)
        {
            return Problem(
                statusCode: StatusCodes.Status503ServiceUnavailable,
                title: "Admin sign-in is turned off",
                detail: "No demo admin password is configured. Set DemoAdmin:Password (see README).");
        }

        if (!authenticator.Validate(request.Username, request.Password))
        {
            // Do not log the attempted password or username.
            logger.LogWarning("Failed admin sign-in attempt.");
            return Problem(
                statusCode: StatusCodes.Status401Unauthorized,
                title: "Sign-in failed",
                detail: "The username or password is incorrect.");
        }

        var identity = new ClaimsIdentity(
            [new Claim(ClaimTypes.Name, authenticator.Username), new Claim(ClaimTypes.Role, AuthPolicies.AdminRole)],
            CookieAuthenticationDefaults.AuthenticationScheme);
        await HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity));
        return Ok(new AdminUserDto(authenticator.Username));
    }

    [HttpPost("logout")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Logout()
    {
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return NoContent();
    }

    [HttpGet("me")]
    [Authorize(Policy = AuthPolicies.Admin)]
    [ProducesResponseType<AdminUserDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public ActionResult<AdminUserDto> Me() => new AdminUserDto(User.Identity?.Name ?? "");
}
