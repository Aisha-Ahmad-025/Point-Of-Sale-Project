import { describe, expect, test } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';

function Probe() { const { theme, toggle } = useTheme(); return <button onClick={toggle}>{theme}</button>; }

describe('theme', () => {
  test('defaults to the system preference, toggles, and persists across remounts', () => {
    const { unmount } = render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByRole('button')).toHaveTextContent('light'); // matchMedia stub reports no dark preference
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveTextContent('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('ss_theme')).toBe('dark');
    unmount();
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByRole('button')).toHaveTextContent('dark');
  });
});
