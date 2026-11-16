import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import Splash from '../components/Splash';
import '../i18n';

describe('welcome splash', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('shows the brand and tagline, then lifts and calls back in order', () => {
    const onLeave = vi.fn(); const onDone = vi.fn();
    render(<Splash onLeave={onLeave} onDone={onDone} duration={1000} />);
    expect(screen.getByText('Small store. Smarter business.')).toBeInTheDocument();
    expect(screen.getByText(/SwiftShelf/)).toBeInTheDocument();
    expect(onLeave).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1100); });
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('splash').className).toMatch(/leaving/);
    expect(onDone).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(900); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
  test('can be skipped with a click and only finishes once', () => {
    const onLeave = vi.fn(); const onDone = vi.fn();
    render(<Splash onLeave={onLeave} onDone={onDone} duration={5000} />);
    fireEvent.click(screen.getByTestId('splash'));
    fireEvent.keyDown(window, { key: 'Enter' });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onLeave).toHaveBeenCalledTimes(1); expect(onDone).toHaveBeenCalledTimes(1);
  });
});
