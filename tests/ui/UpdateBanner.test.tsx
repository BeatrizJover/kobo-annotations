import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpdateBanner, type RegisterUpdates } from '../../src/ui/UpdateBanner';

afterEach(cleanup);

function setup() {
  let announce: (apply: () => void) => void = () => {};
  const register: RegisterUpdates = (onUpdate) => {
    announce = onUpdate;
  };
  render(<UpdateBanner register={register} />);
  return (apply: () => void) => act(() => announce(apply));
}

describe('UpdateBanner', () => {
  it('stays hidden until a new version is waiting', () => {
    setup();
    expect(screen.queryByText(/new version/)).toBeNull();
  });

  it('applies the update on Reload', async () => {
    const announce = setup();
    const apply = vi.fn();
    await announce(apply);
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(apply).toHaveBeenCalledOnce();
  });

  it('hides without updating on Later', async () => {
    const announce = setup();
    const apply = vi.fn();
    await announce(apply);
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByText(/new version/)).toBeNull();
    expect(apply).not.toHaveBeenCalled();
  });
});
