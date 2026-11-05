import { render, screen } from '@testing-library/preact';
import { describe, it } from 'vitest';
import { App } from '../src/ui/App';

describe('App', () => {
  it('renders the title and the privacy promise', () => {
    render(<App />);
    screen.getByRole('heading', { level: 1, name: 'Kobo Annotations' });
    screen.getByText(/never leaves this computer/);
  });
});
