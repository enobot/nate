import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { quoteFor } from '../test/utils';
import { OrderSummary, QuoteLines } from './OrderSummary';

describe('OrderSummary', () => {
  it('shows the server totals formatted as dollars', () => {
    const quote = quoteFor(
      [
        { seatId: 6, ticketType: 'Adult' },
        { seatId: 3, ticketType: 'Child' },
      ],
      [{ itemId: 1, quantity: 2 }],
    );
    render(<OrderSummary totals={quote} salesTaxRate={quote.salesTaxRate} />);

    const rows = screen.getAllByRole('term').map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]);
    expect(rows).toEqual([
      ['Tickets', '$28.50'], // 14.50 + 3.50 premium + 10.50
      ['Concessions', '$13.00'],
      ['Sales tax (7.75%)', '$1.01'],
      ['Total', '$42.51'],
    ]);
  });

  it('notes matinee savings and simulated refunds', () => {
    render(
      <OrderSummary
        totals={{ ticketSubtotalCents: 2300, concessionSubtotalCents: 0, discountCents: 600, taxCents: 0, totalCents: 2300 }}
        isMatinee
        refundedCents={2300}
      />,
    );

    expect(screen.getByText('Matinee savings included above').nextElementSibling).toHaveTextContent('$6.00');
    expect(screen.getByText('Refunded (simulated)').nextElementSibling).toHaveTextContent('$23.00');
    expect(screen.getByTestId('order-total')).toHaveTextContent('$23.00');
  });

  it('lists each ticket and concession line', () => {
    const quote = quoteFor([{ seatId: 6, ticketType: 'Senior' }], [{ itemId: 6, quantity: 3 }]);
    render(<QuoteLines quote={quote} />);

    const items = screen.getAllByRole('listitem');
    expect(within(items[0]).getByText(/Seat B2 · Senior/)).toBeInTheDocument();
    expect(items[0]).toHaveTextContent('premium +$3.50');
    expect(items[0]).toHaveTextContent('$15.00');
    expect(items[1]).toHaveTextContent('3 × Fountain Drink (Medium)');
    expect(items[1]).toHaveTextContent('$16.50');
  });
});
