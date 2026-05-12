import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TagChips, type TagChipsItem } from './tag-chips';

const items: TagChipsItem[] = [
  { slug: 'governance', name: 'Governance', colorHex: '#4f46e5', unverified: false },
  { slug: 'data', name: 'Data', colorHex: '#7c2d12', unverified: false },
];

describe('TagChips', () => {
  it('renders nothing when given an empty list', () => {
    const { container } = render(<TagChips tags={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one chip per tag with the tag name visible', () => {
    render(<TagChips tags={items} />);
    expect(screen.getByText('Governance')).toBeInTheDocument();
    expect(screen.getByText('Data')).toBeInTheDocument();
  });

  it('uses the colorHex on a known tag', () => {
    render(<TagChips tags={[items[0]!]} />);
    const chip = screen.getByText('Governance').closest('span');
    expect(chip?.getAttribute('style') ?? '').toContain('#4f46e5');
  });

  it('renders unverified tags with a visual hint (data-unverified)', () => {
    render(
      <TagChips
        tags={[{ slug: 'unknown', name: 'Unknown', colorHex: null, unverified: true }]}
      />,
    );
    const chip = screen.getByText('Unknown').closest('[data-unverified]');
    expect(chip).not.toBeNull();
    expect(chip?.getAttribute('data-unverified')).toBe('true');
  });
});
