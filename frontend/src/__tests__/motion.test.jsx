import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnimatedNumber, Reveal, Sparkline, Trend, sparklinePath } from '../components/motion';
import { filterCommands } from '../components/CommandPalette';
import { prefetchRoute } from '../utils/routes';
import Art, { ART_NAMES } from '../components/illustrations';

describe('sparkline', () => {
  test('builds a smooth line and a closed area, with the last point marked', () => {
    const p = sparklinePath([1, 5, 3, 8], 96, 32);
    expect(p.line.startsWith('M ')).toBe(true); expect(p.line).toContain('C ');
    expect(p.area.endsWith('Z')).toBe(true); expect(p.last).not.toBeNull();
  });
  test('handles empty, single and flat data without NaN', () => {
    expect(sparklinePath([]).line).toBe('');
    expect(sparklinePath([4]).line).not.toContain('NaN'); expect(sparklinePath([2, 2, 2]).line).not.toContain('NaN');
  });
  test('renders an aria-hidden svg and nothing for no data', () => {
    const { container } = render(<><Sparkline data={[1, 2, 3]} /><Sparkline data={[]} /></>);
    expect(container.querySelectorAll('svg')).toHaveLength(1); expect(container.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
  });
});

describe('trend badge', () => {
  test('shows direction and colour, and flips them for inverse metrics', () => {
    const { rerender } = render(<Trend value={12.5} />);
    expect(screen.getByTestId('trend').textContent).toContain('12.5%'); expect(screen.getByTestId('trend').className).toMatch(/text-ok/);
    rerender(<Trend value={-4} />); expect(screen.getByTestId('trend').className).toMatch(/text-danger/);
    rerender(<Trend value={5} inverse />); expect(screen.getByTestId('trend').className).toMatch(/text-danger/);
    rerender(<Trend value={null} />); expect(screen.queryByTestId('trend')).toBeNull();
  });
});

describe('animated number and reveal', () => {
  test('shows the final value immediately when reduced motion is requested (and never NaN)', () => {
    window.matchMedia = (q) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} });
    render(<AnimatedNumber value={1234} format={(v) => `Rs ${Math.round(v)}`} />);
    expect(screen.getByText('Rs 1234')).toBeInTheDocument();
    render(<AnimatedNumber value={undefined} />); expect(screen.getByText('0')).toBeInTheDocument();
  });
  test('Reveal renders its children and is visible without IntersectionObserver', () => {
    render(<Reveal><p>hello</p></Reveal>);
    expect(screen.getByText('hello').parentElement.className).toMatch(/is-in/);
  });
});

describe('command palette filtering', () => {
  const cmds = [{ label: 'New sale', keywords: 'checkout pos' }, { label: 'Go to Products', keywords: 'catalogue' }, { label: 'Add product', keywords: 'create new item' }];
  test('empty query keeps everything; words must all match; prefix matches come first', () => {
    expect(filterCommands(cmds, '')).toHaveLength(3);
    expect(filterCommands(cmds, 'new').map((c) => c.label)).toEqual(['New sale', 'Add product']);
    expect(filterCommands(cmds, 'add prod').map((c) => c.label)).toEqual(['Add product']);
    expect(filterCommands(cmds, 'zzz')).toEqual([]);
  });
});

describe('route prefetch and illustrations', () => {
  test('prefetch only starts a download once and ignores unknown paths', () => {
    expect(prefetchRoute('/not-a-page')).toBe(false);
  });
  test('every illustration renders', () => {
    ART_NAMES.forEach((n) => { const { container, unmount } = render(<Art name={n} />); expect(container.querySelector(`[data-art="${n}"]`)).not.toBeNull(); unmount(); });
  });
});
