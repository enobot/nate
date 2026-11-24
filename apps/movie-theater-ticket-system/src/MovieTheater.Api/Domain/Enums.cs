namespace MovieTheater.Api.Domain;

public enum SeatType
{
    Standard,
    Premium,
    Accessible,
}

public enum TicketType
{
    Adult,
    Child,
    Senior,
}

public enum OrderStatus
{
    Paid,
    Cancelled,
}

public enum CancellationSource
{
    Customer,
    Admin,
}

/// <summary>Status of a seat for one screening, as shown on the seat map.</summary>
public enum SeatStatus
{
    Available,
    Held,
    Sold,
}

public enum ConcessionCategory
{
    Snack,
    Drink,
    Combo,
}
