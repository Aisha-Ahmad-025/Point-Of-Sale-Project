import { describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchInput } from '../components/ui';
import '../i18n';

describe('SearchInput', () => {
  test('has room for the icon, shows a clear button only when there is text and clears + refocuses', () => {
    const onChange = vi.fn();
    const { rerender } = render(<SearchInput value="" onChange={onChange} placeholder="Search" aria-label="Search" />);
    const input = screen.getByLabelText('Search');
    expect(input.className).toMatch(/ps-10/); expect(input.className).toMatch(/pe-9/);
    expect(screen.queryByLabelText('Clear')).toBeNull();
    rerender(<SearchInput value="milk" onChange={onChange} placeholder="Search" aria-label="Search" />);
    fireEvent.click(screen.getByLabelText('Clear'));
    expect(onChange).toHaveBeenCalledWith({ target: { value: '' } });
    expect(input).toHaveFocus();
  });
  test('forwards normal input props (value, typing, keydown)', () => {
    const onChange = vi.fn(); const onKeyDown = vi.fn();
    render(<SearchInput value="" onChange={onChange} onKeyDown={onKeyDown} aria-label="Find" />);
    fireEvent.change(screen.getByLabelText('Find'), { target: { value: 'cola' } });
    fireEvent.keyDown(screen.getByLabelText('Find'), { key: 'Enter' });
    expect(onChange).toHaveBeenCalled(); expect(onKeyDown).toHaveBeenCalled();
  });
});
