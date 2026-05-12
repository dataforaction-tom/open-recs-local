import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TagMultiSelect, type TagOption } from './tag-multi-select';

const options: TagOption[] = [
  { slug: 'governance', name: 'Governance', colorHex: '#4f46e5', unverified: false },
  { slug: 'data', name: 'Data', colorHex: '#7c2d12', unverified: false },
  { slug: 'ai', name: 'AI', colorHex: '#1e40af', unverified: false },
];

describe('TagMultiSelect', () => {
  it('shows a chip for every currently selected slug', () => {
    render(
      <TagMultiSelect
        label="Themes"
        options={options}
        value={['governance', 'data']}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('Governance')).toBeInTheDocument();
    expect(screen.getByText('Data')).toBeInTheDocument();
  });

  it("clicking a chip's remove button removes that slug from value", async () => {
    const onChange = vi.fn();
    render(
      <TagMultiSelect
        label="Themes"
        options={options}
        value={['governance', 'data']}
        onChange={onChange}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Remove Governance/i }));
    expect(onChange).toHaveBeenCalledWith(['data']);
  });

  it('clicking an option in the dropdown adds it to value', async () => {
    const onChange = vi.fn();
    render(
      <TagMultiSelect
        label="Themes"
        options={options}
        value={['governance']}
        onChange={onChange}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Add tag/i }));
    await user.click(screen.getByRole('option', { name: 'Data' }));
    expect(onChange).toHaveBeenCalledWith(['governance', 'data']);
  });

  it('typing in the filter narrows the visible options', async () => {
    render(
      <TagMultiSelect
        label="Themes"
        options={options}
        value={[]}
        onChange={() => {}}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Add tag/i }));
    await user.type(screen.getByPlaceholderText(/Filter or add/i), 'gov');
    expect(screen.getByRole('option', { name: 'Governance' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Data' })).toBeNull();
  });

  it('shows an "Add \\"<query>\\"" affordance when no option matches', async () => {
    const onChange = vi.fn();
    render(
      <TagMultiSelect
        label="Themes"
        options={options}
        value={[]}
        onChange={onChange}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Add tag/i }));
    await user.type(screen.getByPlaceholderText(/Filter or add/i), 'climate justice');
    await user.click(screen.getByRole('button', { name: /Add "climate justice"/i }));
    expect(onChange).toHaveBeenCalledWith(['climate-justice']);
  });

  it('does not show selected slugs in the dropdown options', async () => {
    render(
      <TagMultiSelect
        label="Themes"
        options={options}
        value={['governance']}
        onChange={() => {}}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Add tag/i }));
    expect(screen.queryByRole('option', { name: 'Governance' })).toBeNull();
  });
});
