<#
.SYNOPSIS
  Exercises a running Movie Theater Ticket System over HTTP: browse, hold, double-booking
  conflict, quote, simulated checkout, order history, cancellation, and admin access.

.EXAMPLE
  # In one terminal:   dotnet run --project src/MovieTheater.Api
  # In another:        powershell -ExecutionPolicy Bypass -File scripts/smoke-test.ps1
  # Against a hosted copy (admin checks are skipped without a password):
  #   powershell -File scripts/smoke-test.ps1 -BaseUrl https://your-app.example -AdminPassword ''

.NOTES
  Works in Windows PowerShell 5.1 and PowerShell 7. It creates one real order in the target
  database and then cancels it.
#>
param(
    [string]$BaseUrl = 'http://localhost:5301',
    [string]$AdminUser = 'admin',
    [string]$AdminPassword = 'LocalDemo-2026'
)

$ErrorActionPreference = 'Stop'
$script:failures = 0

function Check([string]$name, [bool]$ok, [string]$detail = '') {
    if ($ok) { Write-Host "PASS  $name $detail" -ForegroundColor Green }
    else { Write-Host "FAIL  $name $detail" -ForegroundColor Red; $script:failures++ }
}

function Api([string]$method, [string]$path, $body = $null, $session = $null) {
    $params = @{ Method = $method; Uri = "$BaseUrl$path"; ContentType = 'application/json'; UseBasicParsing = $true }
    if ($null -ne $body) { $params.Body = ($body | ConvertTo-Json -Depth 6) }
    if ($null -ne $session) { $params.WebSession = $session }
    try {
        $response = Invoke-WebRequest @params
        $isJson = "$($response.Headers['Content-Type'])" -match 'json'
        $content = if ($response.Content -and $isJson) { $response.Content | ConvertFrom-Json } else { $response.Content }
        return [pscustomobject]@{ Status = [int]$response.StatusCode; Body = $content; Raw = $response }
    }
    catch {
        $resp = $_.Exception.Response
        if ($null -eq $resp) { throw }
        $text = ''
        try {
            if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $text = $_.ErrorDetails.Message }
            else { $reader = New-Object System.IO.StreamReader($resp.GetResponseStream()); $text = $reader.ReadToEnd() }
        } catch { }
        $parsed = $null
        if ($text) { try { $parsed = $text | ConvertFrom-Json } catch { } }
        return [pscustomobject]@{ Status = [int]$resp.StatusCode; Body = $parsed; Raw = $null }
    }
}

Write-Host "Smoke testing $BaseUrl"

$health = Api GET '/healthz'
Check 'health endpoint' ($health.Status -eq 200)

$spa = Invoke-WebRequest -Uri "$BaseUrl/screenings/1" -UseBasicParsing
Check 'client route serves the React app' ($spa.StatusCode -eq 200 -and $spa.Content -match '<div id="root">')

$missing = Api GET '/api/not-a-route'
Check 'unknown API route is a JSON 404' ($missing.Status -eq 404)

$today = Api GET '/api/showtimes'
Check 'showtimes listing' ($today.Status -eq 200 -and $today.Body.dates.Count -eq 7) "($($today.Body.movies.Count) movies today)"

$tomorrow = Api GET "/api/showtimes?date=$($today.Body.dates[1])"
$showtime = $tomorrow.Body.movies[0].showtimes[0]
Check 'tomorrow has showtimes' ($null -ne $showtime) "(screening $($showtime.id), $($tomorrow.Body.movies[0].movie.title))"

$detail = Api GET "/api/screenings/$($showtime.id)"
$seat = $detail.Body.seats | Where-Object { $_.status -eq 'Available' -and $_.seatType -eq 'Standard' } | Select-Object -First 1
Check 'seat map loads' ($detail.Status -eq 200 -and $null -ne $seat) "(seat $($seat.label))"

$cartA = (Api POST '/api/carts').Body.cartToken
$cartB = (Api POST '/api/carts').Body.cartToken
$hold = Api POST "/api/carts/$cartA/holds" @{ screeningId = $showtime.id; seatId = $seat.id }
Check 'hold a seat' ($hold.Status -eq 200 -and $hold.Body.holds.Count -eq 1) "(expires $($hold.Body.expiresAtUtc))"

$conflict = Api POST "/api/carts/$cartB/holds" @{ screeningId = $showtime.id; seatId = $seat.id }
Check 'second cart cannot hold the same seat (409)' ($conflict.Status -eq 409) "($($conflict.Body.code))"

$selection = @{ screeningId = $showtime.id; tickets = @(@{ seatId = $seat.id; ticketType = 'Adult' }); concessions = @(@{ itemId = 1; quantity = 1 }) }
$quote = Api POST '/api/orders/quote' $selection
Check 'server-side quote' ($quote.Status -eq 200 -and $quote.Body.totalCents -gt 0) "(total $($quote.Body.totalCents) cents, tax $($quote.Body.taxCents))"

$badCheckout = Api POST '/api/orders' @{ cartToken = $cartA; customerName = ''; customerEmail = 'nope'; tickets = @() }
Check 'invalid checkout is a 400 with field errors' ($badCheckout.Status -eq 400 -and $null -ne $badCheckout.Body.errors)

$email = 'smoke.test@example.com'
$checkout = Api POST '/api/orders' @{ cartToken = $cartA; customerName = 'Smoke Test'; customerEmail = $email; tickets = $selection.tickets; concessions = $selection.concessions; simulateDecline = $false }
$order = $checkout.Body
Check 'simulated checkout creates an order (201)' ($checkout.Status -eq 201 -and $order.status -eq 'Paid') "($($order.orderNumber), $($order.totalCents) cents)"
Check 'order total matches the quote' ($order.totalCents -eq $quote.Body.totalCents)

$retry = Api POST '/api/orders' @{ cartToken = $cartA; customerName = 'Smoke Test'; customerEmail = $email; tickets = $selection.tickets; concessions = $selection.concessions }
Check 'repeating checkout returns the same order (200)' ($retry.Status -eq 200 -and $retry.Body.orderNumber -eq $order.orderNumber)

$sold = (Api GET "/api/screenings/$($showtime.id)").Body.seats | Where-Object { $_.id -eq $seat.id }
Check 'seat now shows as sold' ($sold.status -eq 'Sold')

$history = Api POST '/api/orders/history' @{ orderNumber = $order.orderNumber; email = $email }
Check 'order history lookup' ($history.Status -eq 200 -and ($history.Body.orders | Where-Object { $_.orderNumber -eq $order.orderNumber }))

$wrong = Api POST '/api/orders/history' @{ orderNumber = $order.orderNumber; email = 'someone.else@example.com' }
Check 'lookup with the wrong email is a 404' ($wrong.Status -eq 404)

$cancel = Api POST "/api/orders/$($order.orderNumber)/cancel" @{ email = $email }
Check 'cancel the order' ($cancel.Status -eq 200 -and $cancel.Body.status -eq 'Cancelled') "(refunded $($cancel.Body.refundedCents) cents, simulated)"

$freed = (Api GET "/api/screenings/$($showtime.id)").Body.seats | Where-Object { $_.id -eq $seat.id }
Check 'cancelled seat is available again' ($freed.status -eq 'Available')

$anonymous = Api GET '/api/admin/movies'
Check 'admin API rejects anonymous requests (401)' ($anonymous.Status -eq 401)

if ($AdminPassword) {
    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $login = Api POST '/api/admin/auth/login' @{ username = $AdminUser; password = $AdminPassword } $session
    Check 'admin sign-in' ($login.Status -eq 200)
    $report = Api GET '/api/admin/reports/sales' $null $session
    Check 'sales report' ($report.Status -eq 200) "(paid orders $($report.Body.paidOrders), gross $($report.Body.grossCents) cents)"
    $orders = Api GET "/api/admin/orders?search=$($order.orderNumber)" $null $session
    Check 'admin can find the order' ($orders.Body.totalCount -eq 1)
}
else {
    Write-Host 'SKIP  admin checks (no -AdminPassword given)'
}

if ($script:failures -gt 0) {
    Write-Host "$($script:failures) check(s) failed." -ForegroundColor Red
    exit 1
}
Write-Host 'All smoke checks passed.' -ForegroundColor Green
