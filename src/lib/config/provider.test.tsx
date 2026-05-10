import { describe, expect, it } from 'vitest';
import { render, renderHook, screen } from '@testing-library/react';
import { ConfigProvider, useConfig } from './provider';
import type { PublicConfig } from './public';

const localConfig: PublicConfig = {
  appMode: 'local',
  features: { auth: false, ownership: false, admin: false },
};

const hostedConfig: PublicConfig = {
  appMode: 'hosted',
  features: { auth: true, ownership: true, admin: true },
};

describe('ConfigProvider + useConfig', () => {
  it('exposes the supplied config to descendants', () => {
    function Probe() {
      const config = useConfig();
      return <span data-testid="probe">{config.appMode}</span>;
    }
    render(
      <ConfigProvider value={hostedConfig}>
        <Probe />
      </ConfigProvider>,
    );
    expect(screen.getByTestId('probe').textContent).toBe('hosted');
  });

  it('throws a clear error when used outside the provider', () => {
    expect(() => renderHook(() => useConfig())).toThrowError(/ConfigProvider/);
  });

  it('reflects the local-mode config shape too', () => {
    function Probe() {
      const config = useConfig();
      return <span data-testid="probe">{String(config.features.auth)}</span>;
    }
    render(
      <ConfigProvider value={localConfig}>
        <Probe />
      </ConfigProvider>,
    );
    expect(screen.getByTestId('probe').textContent).toBe('false');
  });
});
