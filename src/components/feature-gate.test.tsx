import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfigProvider } from '@/lib/config/provider';
import type { PublicConfig } from '@/lib/config/public';
import { FeatureGate } from './feature-gate';

const localConfig: PublicConfig = {
  appMode: 'local',
  features: { auth: false, ownership: false, admin: false },
};

const hostedConfig: PublicConfig = {
  appMode: 'hosted',
  features: { auth: true, ownership: true, admin: true },
};

describe('FeatureGate', () => {
  it('renders children when the feature is enabled', () => {
    render(
      <ConfigProvider value={hostedConfig}>
        <FeatureGate feature="auth">
          <span data-testid="gated">visible</span>
        </FeatureGate>
      </ConfigProvider>,
    );
    expect(screen.getByTestId('gated')).toBeInTheDocument();
  });

  it('renders nothing when the feature is disabled', () => {
    render(
      <ConfigProvider value={localConfig}>
        <FeatureGate feature="auth">
          <span data-testid="gated">should not render</span>
        </FeatureGate>
      </ConfigProvider>,
    );
    expect(screen.queryByTestId('gated')).not.toBeInTheDocument();
  });

  it('respects per-feature granularity', () => {
    const partial: PublicConfig = {
      appMode: 'hosted',
      features: { auth: true, ownership: false, admin: true },
    };
    render(
      <ConfigProvider value={partial}>
        <FeatureGate feature="auth">
          <span data-testid="auth">a</span>
        </FeatureGate>
        <FeatureGate feature="ownership">
          <span data-testid="ownership">o</span>
        </FeatureGate>
        <FeatureGate feature="admin">
          <span data-testid="admin">x</span>
        </FeatureGate>
      </ConfigProvider>,
    );
    expect(screen.getByTestId('auth')).toBeInTheDocument();
    expect(screen.queryByTestId('ownership')).not.toBeInTheDocument();
    expect(screen.getByTestId('admin')).toBeInTheDocument();
  });
});
