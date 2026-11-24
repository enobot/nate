import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { screeningDetail } from '../test/utils';
import { SeatLegend, SeatMap, seatLabel, type SeatView } from './SeatMap';

function setup(overrides: { pending?: Set<number>; interactive?: boolean; selected?: number[] } = {}) {
  const detail = screeningDetail();
  const seats: SeatView[] = detail.seats.map((s) => ({ ...s, status: overrides.selected?.includes(s.id) ? 'Selected' : s.status }));
  const onToggle = vi.fn();
  render(
    <SeatMap layout={detail.auditorium} seats={seats} pendingSeatIds={overrides.pending} interactive={overrides.interactive} onToggle={onToggle} />,
  );
  return { onToggle };
}

describe('SeatMap', () => {
  it('labels every seat with its row, number, type and status', () => {
    setup({ selected: [2] });

    expect(screen.getByRole('button', { name: 'Row A seat 1, wheelchair accessible, available' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Row A seat 2, selected by you' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Row A seat 3, available' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Row A seat 4, sold' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Row B seat 2, premium, available' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Row B seat 4, held by another customer' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getAllByRole('group', { name: /^Row [AB]$/ })).toHaveLength(2);
  });

  it('selects an available seat and releases a selected one', async () => {
    const user = userEvent.setup();
    const { onToggle } = setup({ selected: [2] });

    await user.click(screen.getByRole('button', { name: 'Row A seat 3, available' }));
    await user.click(screen.getByRole('button', { name: 'Row A seat 2, selected by you' }));

    expect(onToggle).toHaveBeenCalledTimes(2);
    expect(onToggle.mock.calls[0][0]).toMatchObject({ id: 3, status: 'Available' });
    expect(onToggle.mock.calls[1][0]).toMatchObject({ id: 2, status: 'Selected' });
  });

  it('ignores clicks on sold, held, and pending seats', async () => {
    const user = userEvent.setup();
    const { onToggle } = setup({ pending: new Set([3]) });

    await user.click(screen.getByRole('button', { name: 'Row A seat 4, sold' }));
    await user.click(screen.getByRole('button', { name: 'Row B seat 4, held by another customer' }));
    await user.click(screen.getByRole('button', { name: 'Row A seat 3, available' }));

    expect(onToggle).not.toHaveBeenCalled();
  });

  it('is read-only when sales are closed', async () => {
    const user = userEvent.setup();
    const { onToggle } = setup({ interactive: false });

    const seat = screen.getByRole('button', { name: 'Row A seat 3, available' });
    expect(seat).toHaveAttribute('aria-disabled', 'true');
    await user.click(seat);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('keeps one seat in the tab order and moves with the arrow keys', async () => {
    const user = userEvent.setup();
    const { onToggle } = setup();

    await user.tab();
    const first = screen.getByRole('button', { name: 'Row A seat 1, wheelchair accessible, available' });
    expect(first).toHaveFocus();
    expect(screen.getAllByRole('button').filter((b) => b.tabIndex === 0)).toHaveLength(1);

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: 'Row A seat 2, available' })).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: 'Row B seat 2, premium, available' })).toHaveFocus();

    await user.keyboard('{End}');
    expect(screen.getByRole('button', { name: 'Row B seat 4, held by another customer' })).toHaveFocus();

    await user.keyboard('{Home}{ArrowUp}');
    expect(first).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });

  it('builds labels without color words', () => {
    expect(seatLabel({ row: 'C', number: 7, seatType: 'Standard', status: 'Available' })).toBe('Row C seat 7, available');
  });

  it('shows a legend that explains each state in words', () => {
    render(<SeatLegend premiumNote="+$3.50" />);
    const legend = screen.getByRole('list', { name: 'Seat legend' });
    for (const text of ['Available', 'Premium (+$3.50)', 'Wheelchair accessible', 'Your seat', 'Held by someone else', 'Sold']) {
      expect(legend).toHaveTextContent(text);
    }
  });
});
