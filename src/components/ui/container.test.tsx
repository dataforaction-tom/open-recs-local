import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Container } from './container';

describe('Container', () => {
  it('renders its children', () => {
    render(
      <Container>
        <p>hello</p>
      </Container>,
    );
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('forwards extra className alongside the base classes', () => {
    render(
      <Container className="custom-extra" data-testid="root">
        x
      </Container>,
    );
    const el = screen.getByTestId('root');
    expect(el.className).toContain('custom-extra');
    expect(el.className).toContain('mx-auto');
  });

  it('forwards arbitrary props to the underlying div', () => {
    render(
      <Container id="page" data-testid="root">
        x
      </Container>,
    );
    expect(screen.getByTestId('root').id).toBe('page');
  });
});
