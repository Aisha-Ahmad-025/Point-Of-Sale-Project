import { describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal, Ltr, Pagination, Field } from '../components/ui';
import '../i18n';

describe('accessible dialog', () => {
  test('has dialog semantics, closes on Escape and restores focus', () => {
    const onClose = vi.fn();
    const opener = document.createElement('button'); document.body.appendChild(opener); opener.focus();
    const { rerender } = render(<Modal open title="Hello" onClose={onClose}><button>inside</button></Modal>);
    const dlg = screen.getByRole('dialog');
    expect(dlg).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Hello')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
    rerender(<Modal open={false} title="Hello" onClose={onClose} />);
    expect(opener).toHaveFocus();
  });
  test('identifiers are isolated from RTL reordering', () => {
    render(<Ltr>SKU-001</Ltr>);
    expect(screen.getByText('SKU-001')).toHaveAttribute('dir', 'ltr');
  });
  test('pagination buttons are labelled and respect bounds', () => {
    const go = vi.fn();
    render(<Pagination meta={{ page: 1, pages: 3, total: 50, limit: 20 }} onPage={go} />);
    expect(screen.getByLabelText(/previous/i)).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/next/i)); expect(go).toHaveBeenCalledWith(2);
  });
  test('field accepts wrapped controls and labels the real input', () => {
    render(
      <Field label="Email" hint="Use your work address">
        <div className="relative">
          <input type="email" placeholder="you@store.com" />
          <button type="button">helper</button>
        </div>
      </Field>
    );
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
    expect(screen.getByText('helper')).toBeInTheDocument();
  });
});
