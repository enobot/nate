using System.ComponentModel.DataAnnotations;
using System.Reflection;
using System.Text.RegularExpressions;
using MovieTheater.Api.Contracts;
using MovieTheater.Api.Domain;
using MovieTheater.Api.Services;

namespace MovieTheater.Tests.Unit;

public class TokensAndContractsTests
{
    [Fact]
    public void Cart_tokens_are_random_32_character_hex()
    {
        var tokens = Enumerable.Range(0, 200).Select(_ => Tokens.NewCartToken()).ToList();

        Assert.All(tokens, t => Assert.True(Tokens.IsValidCartToken(t)));
        Assert.Equal(tokens.Count, tokens.Distinct().Count());
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("not-a-token")]
    [InlineData("ABCDEF0123456789ABCDEF0123456789")]   // uppercase is not what the server issues
    [InlineData("abcdef0123456789abcdef012345678")]    // 31 characters
    public void Invalid_cart_tokens_are_rejected(string? token)
    {
        Assert.False(Tokens.IsValidCartToken(token));
    }

    [Fact]
    public void Order_numbers_match_the_documented_pattern()
    {
        var pattern = new Regex(Tokens.OrderNumberPattern);
        for (var i = 0; i < 200; i++)
        {
            var number = Tokens.NewOrderNumber();
            Assert.Matches(pattern, number);
            Assert.DoesNotMatch("[ILOU]", number[3..]);
        }

        Assert.Matches(pattern, "MT-SEED0001");
        Assert.Matches(pattern, "mt-seed0001");
        Assert.DoesNotMatch(pattern, "MT-SEED001");
        Assert.DoesNotMatch(pattern, "MT-SEEDO001");
    }

    [Fact]
    public void Emails_are_normalized_for_lookup()
    {
        Assert.Equal("jordan.rivera@example.com", Tokens.NormalizeEmail("  Jordan.Rivera@Example.COM "));
    }

    [Theory]
    [InlineData(nameof(MovieUpsertRequest.Rating))]
    [InlineData(nameof(MovieUpsertRequest.PosterPalette))]
    [InlineData(nameof(MovieUpsertRequest.PosterMotif))]
    public void Admin_movie_validation_matches_the_poster_and_rating_lists(string property)
    {
        var expected = property switch
        {
            nameof(MovieUpsertRequest.Rating) => PosterStyles.Ratings,
            nameof(MovieUpsertRequest.PosterPalette) => PosterStyles.Palettes,
            _ => PosterStyles.Motifs,
        };

        var allowed = typeof(MovieUpsertRequest).GetProperty(property)!.GetCustomAttribute<AllowedValuesAttribute>()!;

        Assert.Equal(expected, allowed.Values.Cast<string>());
    }
}
