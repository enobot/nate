namespace MovieTheater.Api.Domain;

/// <summary>
/// Poster art is drawn by the client with CSS and SVG from these two keys,
/// so the app never needs real posters or image uploads.
/// </summary>
public static class PosterStyles
{
    public static readonly string[] Palettes = ["ember", "tide", "aurora", "dusk", "moss", "violet", "gold", "frost"];

    public static readonly string[] Motifs = ["orbit", "waves", "peaks", "grid", "rings", "sun", "beam", "stars"];

    public static readonly string[] Ratings = ["G", "PG", "PG-13", "R"];
}
