import { render, screen } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { App } from '../src/ui/App';

describe('App', () => {
  it('renders the title and the privacy promise', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Kobo Annotations' })).toBeTruthy();
    expect(screen.getByText(/never leaves this computer/)).toBeTruthy();
  });
});
