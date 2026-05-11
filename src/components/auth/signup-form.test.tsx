import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const signUpMock = vi.fn();
const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock('@/lib/auth/client', () => ({
  authClient: {
    signUp: { email: (...args: unknown[]) => signUpMock(...args) },
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

beforeEach(() => {
  signUpMock.mockReset();
  pushMock.mockReset();
  refreshMock.mockReset();
});

async function render_(): Promise<void> {
  // dynamic import so the vi.mock above lands before module resolution
  const { SignupForm } = await import('./signup-form');
  render(<SignupForm />);
}

describe('<SignupForm>', () => {
  it('shows validation errors for empty fields and does not call the API', async () => {
    const user = userEvent.setup();
    await render_();
    await user.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText(/required/i)).toBeInTheDocument();
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it('rejects a short password client-side', async () => {
    const user = userEvent.setup();
    await render_();
    await user.type(screen.getByLabelText('Name'), 'Alice');
    await user.type(screen.getByLabelText('Email'), 'alice@example.com');
    await user.type(screen.getByLabelText('Password'), 'short');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument();
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it('submits and redirects to /dashboard on success', async () => {
    signUpMock.mockResolvedValue({ data: { user: { id: 'x' } }, error: null });
    const user = userEvent.setup();
    await render_();
    await user.type(screen.getByLabelText('Name'), 'Alice');
    await user.type(screen.getByLabelText('Email'), 'alice@example.com');
    await user.type(screen.getByLabelText('Password'), 'password-12345');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    await waitFor(() => expect(signUpMock).toHaveBeenCalledOnce());
    expect(signUpMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'alice@example.com',
        password: 'password-12345',
        name: 'Alice',
      }),
    );
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/dashboard'));
  });

  it('surfaces server errors and stays on the form', async () => {
    signUpMock.mockResolvedValue({ error: { message: 'Email already in use' } });
    const user = userEvent.setup();
    await render_();
    await user.type(screen.getByLabelText('Name'), 'Alice');
    await user.type(screen.getByLabelText('Email'), 'alice@example.com');
    await user.type(screen.getByLabelText('Password'), 'password-12345');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email already in use');
    expect(pushMock).not.toHaveBeenCalled();
  });
});
