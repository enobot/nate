using System.Text.Json.Serialization;
using System.Threading.Channels;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.Extensions.DependencyInjection;
using MovieTheater.Api.Domain;
using MovieTheater.Api.Hubs;

namespace MovieTheater.Tests.Integration;

/// <summary>
/// Connects a real SignalR client to the in-memory server and checks that seat changes made
/// through the REST API are pushed to viewers of that screening (and only that screening).
/// Long polling is used because the in-memory test server does not host WebSockets for the
/// SignalR client; the hub code is the same for every transport.
/// </summary>
public class SeatHubTests
{
    private static async Task<(HubConnection Connection, ChannelReader<SeatsChangedMessage> Messages)> ConnectAsync(TestApp app, int screeningId)
    {
        var channel = Channel.CreateUnbounded<SeatsChangedMessage>();
        var connection = new HubConnectionBuilder()
            .WithUrl(new Uri(app.Server.BaseAddress, SeatHub.Path.TrimStart('/')), options =>
            {
                options.HttpMessageHandlerFactory = _ => app.Server.CreateHandler();
                options.Transports = HttpTransportType.LongPolling;
            })
            .AddJsonProtocol(o => o.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter()))
            .Build();
        connection.On<SeatsChangedMessage>(SeatHub.SeatsChangedMethod, m => channel.Writer.TryWrite(m));

        await connection.StartAsync();
        await connection.InvokeAsync(nameof(SeatHub.JoinScreening), screeningId);
        return (connection, channel.Reader);
    }

    private static async Task<SeatsChangedMessage> NextAsync(ChannelReader<SeatsChangedMessage> messages)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        return await messages.ReadAsync(timeout.Token);
    }

    [Fact]
    public async Task Viewers_receive_hold_release_sold_and_cancel_updates()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();
        var screening = await client.GetUpcomingScreeningAsync();
        var seat = screening.AvailableSeat();
        var (connection, messages) = await ConnectAsync(app, screening.Screening.Id);
        await using var _ = connection;

        var cart = await client.NewCartAsync();
        await client.HoldAsync(cart, screening.Screening.Id, seat.Id);
        var held = await NextAsync(messages);
        Assert.Equal(screening.Screening.Id, held.ScreeningId);
        Assert.Equal(new SeatChange(seat.Id, SeatStatus.Held), Assert.Single(held.Changes));

        await client.DeleteAsync($"/api/carts/{cart}/holds/{seat.Id}");
        Assert.Equal(new SeatChange(seat.Id, SeatStatus.Available), Assert.Single((await NextAsync(messages)).Changes));

        var order = await client.BookAsync(screening.Screening.Id, [seat.Id], email: "live@example.com");
        Assert.Equal(SeatStatus.Held, Assert.Single((await NextAsync(messages)).Changes).Status);
        Assert.Equal(new SeatChange(seat.Id, SeatStatus.Sold), Assert.Single((await NextAsync(messages)).Changes));

        await client.PostJsonAsync($"/api/orders/{order.OrderNumber}/cancel", new { email = "live@example.com" });
        Assert.Equal(new SeatChange(seat.Id, SeatStatus.Available), Assert.Single((await NextAsync(messages)).Changes));
    }

    [Fact]
    public async Task Expired_holds_are_pushed_as_available()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();
        var screening = await client.GetUpcomingScreeningAsync();
        var seat = screening.AvailableSeat();
        var (connection, messages) = await ConnectAsync(app, screening.Screening.Id);
        await using var _ = connection;
        var cart = await client.NewCartAsync();
        await client.HoldAsync(cart, screening.Screening.Id, seat.Id);
        await NextAsync(messages);

        app.Time.Advance(TimeSpan.FromMinutes(11));
        await using (var scope = app.Services.CreateAsyncScope())
        {
            await scope.ServiceProvider.GetRequiredService<MovieTheater.Api.Services.CartService>().ReleaseExpiredHoldsAsync(CancellationToken.None);
        }

        Assert.Equal(new SeatChange(seat.Id, SeatStatus.Available), Assert.Single((await NextAsync(messages)).Changes));
    }

    [Fact]
    public async Task Viewers_of_other_screenings_are_not_notified()
    {
        await using var app = new TestApp();
        var client = app.CreateClient();
        var watched = await client.GetUpcomingScreeningAsync(0);
        var other = await client.GetUpcomingScreeningAsync(1);
        var (connection, messages) = await ConnectAsync(app, watched.Screening.Id);
        await using var _ = connection;

        var otherCart = await client.NewCartAsync();
        await client.HoldAsync(otherCart, other.Screening.Id, other.AvailableSeat().Id);
        var watchedCart = await client.NewCartAsync();
        await client.HoldAsync(watchedCart, watched.Screening.Id, watched.AvailableSeat().Id);

        // The first message to arrive must be for the watched screening.
        var first = await NextAsync(messages);
        Assert.Equal(watched.Screening.Id, first.ScreeningId);
    }
}
