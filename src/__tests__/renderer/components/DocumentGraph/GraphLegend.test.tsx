/**
 * Tests for the GraphLegend component
 *
 * The GraphLegend displays a collapsible panel explaining node types, edge types,
 * and colors in the Document Graph visualization.
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { GraphLegend, type GraphLegendProps } from '../../../../renderer/components/DocumentGraph/GraphLegend';
import type { Theme } from '../../../../renderer/types';

// Mock theme for testing
const mockTheme: Theme = {
  id: 'dracula',
  name: 'Dracula',
  mode: 'dark',
  colors: {
    bgMain: '#282a36',
    bgSidebar: '#21222c',
    bgActivity: '#343746',
    border: '#44475a',
    textMain: '#f8f8f2',
    textDim: '#6272a4',
    accent: '#bd93f9',
    accentDim: 'rgba(189, 147, 249, 0.2)',
    accentText: '#ff79c6',
    accentForeground: '#282a36',
    success: '#50fa7b',
    warning: '#ffb86c',
    error: '#ff5555',
  },
};

// Light theme for theme testing
const lightTheme: Theme = {
  ...mockTheme,
  id: 'light',
  name: 'Light',
  mode: 'light',
  colors: {
    ...mockTheme.colors,
    bgMain: '#ffffff',
    bgSidebar: '#f5f5f5',
    bgActivity: '#fafafa',
    border: '#e5e5e5',
    textMain: '#1a1a1a',
    textDim: '#666666',
    accent: '#6366f1',
  },
};

// Default props for testing
const defaultProps: GraphLegendProps = {
  theme: mockTheme,
  showExternalLinks: true,
};

describe('GraphLegend', () => {
  describe('Rendering', () => {
    it('renders in collapsed state by default', () => {
      render(<GraphLegend {...defaultProps} />);

      // Should show the header button
      expect(screen.getByRole('button', { name: /legend/i })).toBeInTheDocument();

      // Should NOT show the content sections
      expect(screen.queryByText('Node Types')).not.toBeInTheDocument();
    });

    it('renders in expanded state when defaultExpanded is true', () => {
      render(<GraphLegend {...defaultProps} defaultExpanded />);

      // Should show the content sections
      expect(screen.getByText('Node Types')).toBeInTheDocument();
      expect(screen.getByText('Connection Types')).toBeInTheDocument();
      expect(screen.getByText('Selection')).toBeInTheDocument();
    });

    it('renders all node types when showExternalLinks is true', () => {
      render(<GraphLegend {...defaultProps} defaultExpanded showExternalLinks />);

      expect(screen.getByText('Document')).toBeInTheDocument();
      // External Link appears in both Node Types and Connection Types sections
      const externalLinks = screen.getAllByText('External Link');
      expect(externalLinks.length).toBeGreaterThanOrEqual(1);
    });

    it('hides external node type when showExternalLinks is false', () => {
      render(<GraphLegend {...defaultProps} defaultExpanded showExternalLinks={false} />);

      expect(screen.getByText('Document')).toBeInTheDocument();
      // External Link should appear once in "Connection Types" section for edges
      // but not in "Node Types" section
      const nodeTypesSection = screen.getByText('Node Types').parentElement;
      expect(within(nodeTypesSection!).queryByText('External Link')).not.toBeInTheDocument();
    });

    it('renders all edge types when showExternalLinks is true', () => {
      render(<GraphLegend {...defaultProps} defaultExpanded showExternalLinks />);

      expect(screen.getByText('Internal Link')).toBeInTheDocument();
      // External Link appears in both Node Types and Connection Types sections
      const allExternalLinks = screen.getAllByText('External Link');
      expect(allExternalLinks.length).toBe(2); // One in nodes, one in edges
    });

    it('hides external edge type when showExternalLinks is false', () => {
      render(<GraphLegend {...defaultProps} defaultExpanded showExternalLinks={false} />);

      expect(screen.getByText('Internal Link')).toBeInTheDocument();

      // External Link should not appear at all when external links are disabled
      expect(screen.queryByText('External Link')).not.toBeInTheDocument();
    });

    it('renders selection section with selected node preview', () => {
      render(<GraphLegend {...defaultProps} defaultExpanded />);

      expect(screen.getByText('Selection')).toBeInTheDocument();
      expect(screen.getByText('Selected Node')).toBeInTheDocument();
      expect(screen.getByText('Connected Edge')).toBeInTheDocument();
    });

    it('renders interaction hints', () => {
      render(<GraphLegend {...defaultProps} defaultExpanded />);

      expect(screen.getByText('Double-click to open')).toBeInTheDocument();
      expect(screen.getByText('Right-click for context menu')).toBeInTheDocument();
    });
  });

  describe('Toggle Behavior', () => {
    it('expands when header is clicked', () => {
      render(<GraphLegend {...defaultProps} />);

      // Initially collapsed
      expect(screen.queryByText('Node Types')).not.toBeInTheDocument();

      // Click to expand
      fireEvent.click(screen.getByRole('button', { name: /legend/i }));

      // Should now show content
      expect(screen.getByText('Node Types')).toBeInTheDocument();
    });

    it('collapses when header is clicked again', () => {
      render(<GraphLegend {...defaultProps} defaultExpanded />);

      // Initially expanded
      expect(screen.getByText('Node Types')).toBeInTheDocument();

      // Click to collapse
      fireEvent.click(screen.getByRole('button', { name: /legend/i }));

      // Should no longer show content
      expect(screen.queryByText('Node Types')).not.toBeInTheDocument();
    });

    it('toggles multiple times correctly', () => {
      render(<GraphLegend {...defaultProps} />);

      const button = screen.getByRole('button', { name: /legend/i });

      // First click: expand
      fireEvent.click(button);
      expect(screen.getByText('Node Types')).toBeInTheDocument();

      // Second click: collapse
      fireEvent.click(button);
      expect(screen.queryByText('Node Types')).not.toBeInTheDocument();

      // Third click: expand again
      fireEvent.click(button);
      expect(screen.getByText('Node Types')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has region role with aria-label', () => {
      render(<GraphLegend {...defaultProps} />);

      expect(screen.getByRole('region', { name: /graph legend/i })).toBeInTheDocument();
    });

    it('toggle button has aria-expanded attribute', () => {
      render(<GraphLegend {...defaultProps} />);

      const button = screen.getByRole('button', { name: /legend/i });
      expect(button).toHaveAttribute('aria-expanded', 'false');
    });

    it('aria-expanded updates when toggled', () => {
      render(<GraphLegend {...defaultProps} />);

      const button = screen.getByRole('button', { name: /legend/i });
      expect(button).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(button);
      expect(button).toHaveAttribute('aria-expanded', 'true');

      fireEvent.click(button);
      expect(button).toHaveAttribute('aria-expanded', 'false');
    });

    it('toggle button has aria-controls referencing content', () => {
      render(<GraphLegend {...defaultProps} />);

      const button = screen.getByRole('button', { name: /legend/i });
      expect(button).toHaveAttribute('aria-controls', 'legend-content');
    });

    it('content container has matching id', () => {
      render(<GraphLegend {...defaultProps} defaultExpanded />);

      expect(document.getElementById('legend-content')).toBeInTheDocument();
    });

    it('node previews have aria-label', () => {
      render(<GraphLegend {...defaultProps} defaultExpanded />);

      // Document node appears twice: once in Node Types, once in Selection (as selected)
      const docNodes = screen.getAllByRole('img', { name: /document node/i });
      expect(docNodes.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByRole('img', { name: /external link node/i })).toBeInTheDocument();
      expect(screen.getByRole('img', { name: /document node \(selected\)/i })).toBeInTheDocument();
    });

    it('edge previews have aria-label', () => {
      render(<GraphLegend {...defaultProps} defaultExpanded />);

      // Internal link edge appears twice: once in Connection Types, once in Selection (as highlighted)
      const internalEdges = screen.getAllByRole('img', { name: /internal link edge/i });
      expect(internalEdges.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByRole('img', { name: /external link edge/i })).toBeInTheDocument();
      expect(screen.getByRole('img', { name: /internal link edge \(highlighted\)/i })).toBeInTheDocument();
    });
  });

  describe('Theme Styling', () => {
    it('applies theme background color to container', () => {
      const { container } = render(<GraphLegend {...defaultProps} />);

      const legend = container.querySelector('.graph-legend');
      expect(legend).toHaveStyle({ backgroundColor: mockTheme.colors.bgActivity });
    });

    it('applies theme border color to container', () => {
      const { container } = render(<GraphLegend {...defaultProps} />);

      const legend = container.querySelector('.graph-legend');
      // Border is a shorthand, check individual properties
      expect(legend).toHaveStyle({ borderWidth: '1px', borderStyle: 'solid' });
    });

    it('applies light theme colors correctly', () => {
      const { container } = render(<GraphLegend {...defaultProps} theme={lightTheme} />);

      const legend = container.querySelector('.graph-legend');
      expect(legend).toHaveStyle({ backgroundColor: lightTheme.colors.bgActivity });
    });

    it('applies accent color to header background', () => {
      render(<GraphLegend {...defaultProps} />);

      const button = screen.getByRole('button', { name: /legend/i });
      expect(button).toHaveStyle({ backgroundColor: `${mockTheme.colors.accent}10` });
    });

    it('section headers use dim text color', () => {
      render(<GraphLegend {...defaultProps} defaultExpanded />);

      // Get all section headers
      const nodeTypesHeader = screen.getByText('Node Types');
      expect(nodeTypesHeader).toHaveStyle({ color: mockTheme.colors.textDim });
    });

    it('item labels use main text color', () => {
      render(<GraphLegend {...defaultProps} defaultExpanded />);

      const documentLabel = screen.getByText('Document');
      expect(documentLabel).toHaveStyle({ color: mockTheme.colors.textMain });
    });

    it('item descriptions use dim text color with opacity', () => {
      render(<GraphLegend {...defaultProps} defaultExpanded />);

      const description = screen.getByText('Markdown file with title, stats, and description');
      expect(description).toHaveStyle({ color: mockTheme.colors.textDim, opacity: '0.8' });
    });
  });

  describe('Node Preview Styling', () => {
    it('document node preview has solid border', () => {
      render(<GraphLegend {...defaultProps} defaultExpanded />);

      const docNode = screen.getByRole('img', { name: /^document node$/i });
      // Check border properties individually since shorthand is computed differently
      expect(docNode).toHaveStyle({ borderWidth: '1px', borderStyle: 'solid' });
    });

    it('external node preview has dashed border', () => {
      render(<GraphLegend {...defaultProps} defaultExpanded />);

      const extNode = screen.getByRole('img', { name: /^external link node$/i });
      // Check border properties individually since shorthand is computed differently
      expect(extNode).toHaveStyle({ borderWidth: '1px', borderStyle: 'dashed' });
    });

    it('selected document node preview has accent border', () => {
      render(<GraphLegend {...defaultProps} defaultExpanded />);

      const selectedNode = screen.getByRole('img', { name: /document node \(selected\)/i });
      // Check border properties individually since shorthand is computed differently
      expect(selectedNode).toHaveStyle({ borderWidth: '2px', borderStyle: 'solid' });
    });

    it('selected node preview has glow box-shadow', () => {
      render(<GraphLegend {...defaultProps} defaultExpanded />);

      const selectedNode = screen.getByRole('img', { name: /document node \(selected\)/i });
      expect(selectedNode).toHaveStyle({ boxShadow: `0 0 0 2px ${mockTheme.colors.accent}40` });
    });

    it('document node preview has FileText icon with accent color', () => {
      render(<GraphLegend {...defaultProps} defaultExpanded />);

      const docNode = screen.getByRole('img', { name: /^document node$/i });
      const icon = docNode.querySelector('svg');
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveStyle({ color: mockTheme.colors.accent });
    });

    it('external node preview has Globe icon with dim color', () => {
      render(<GraphLegend {...defaultProps} defaultExpanded />);

      const extNode = screen.getByRole('img', { name: /^external link node$/i });
      const icon = extNode.querySelector('svg');
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveStyle({ color: mockTheme.colors.textDim });
    });

    it('document node preview shows "Doc" label', () => {
      render(<GraphLegend {...defaultProps} defaultExpanded />);

      const docNode = screen.getByRole('img', { name: /^document node$/i });
      expect(within(docNode).getByText('Doc')).toBeInTheDocument();
    });

    it('external node preview shows "site.com" label', () => {
      render(<GraphLegend {...defaultProps} defaultExpanded />);

      const extNode = screen.getByRole('img', { name: /^external link node$/i });
      expect(within(extNode).getByText('site.com')).toBeInTheDocument();
    });
  });

  describe('Edge Preview Styling', () => {
    it('internal edge preview is solid line', () => {
      render(<GraphLegend {...defaultProps} defaultExpanded />);

      const internalEdge = screen.getByRole('img', { name: /^internal link edge$/i });
      const line = internalEdge.querySelector('line');
      expect(line).toBeInTheDocument();
      expect(line).not.toHaveAttribute('stroke-dasharray');
    });

    it('external edge preview is dashed line', () => {
      render(<GraphLegend {...defaultProps} defaultExpanded />);

      const externalEdge = screen.getByRole('img', { name: /external link edge(?! \(highlighted\))/i });
      const line = externalEdge.querySelector('line');
      expect(line).toBeInTheDocument();
      expect(line).toHaveAttribute('stroke-dasharray', '4 4');
    });

    it('internal edge uses dim text color for stroke', () => {
      render(<GraphLegend {...defaultProps} defaultExpanded />);

      const internalEdge = screen.getByRole('img', { name: /^internal link edge$/i });
      const line = internalEdge.querySelector('line');
      expect(line).toHaveAttribute('stroke', mockTheme.colors.textDim);
    });

    it('highlighted edge uses accent color for stroke', () => {
      render(<GraphLegend {...defaultProps} defaultExpanded />);

      const highlightedEdge = screen.getByRole('img', { name: /internal link edge \(highlighted\)/i });
      const line = highlightedEdge.querySelector('line');
      expect(line).toHaveAttribute('stroke', mockTheme.colors.accent);
    });

    it('highlighted edge has thicker stroke width', () => {
      render(<GraphLegend {...defaultProps} defaultExpanded />);

      const highlightedEdge = screen.getByRole('img', { name: /internal link edge \(highlighted\)/i });
      const line = highlightedEdge.querySelector('line');
      expect(line).toHaveAttribute('stroke-width', '2.5');
    });

    it('normal edge has thinner stroke width', () => {
      render(<GraphLegend {...defaultProps} defaultExpanded />);

      const normalEdge = screen.getByRole('img', { name: /^internal link edge$/i });
      const line = normalEdge.querySelector('line');
      expect(line).toHaveAttribute('stroke-width', '1.5');
    });

    it('edge preview includes arrow head', () => {
      render(<GraphLegend {...defaultProps} defaultExpanded />);

      const internalEdge = screen.getByRole('img', { name: /^internal link edge$/i });
      const arrowPath = internalEdge.querySelector('path');
      expect(arrowPath).toBeInTheDocument();
    });
  });

  describe('Container Styling', () => {
    it('has correct CSS class for styling', () => {
      const { container } = render(<GraphLegend {...defaultProps} />);

      expect(container.querySelector('.graph-legend')).toBeInTheDocument();
    });

    it('is positioned absolutely in bottom-left corner', () => {
      const { container } = render(<GraphLegend {...defaultProps} />);

      const legend = container.querySelector('.graph-legend');
      expect(legend).toHaveClass('absolute', 'bottom-4', 'left-4');
    });

    it('has max-width constraint', () => {
      const { container } = render(<GraphLegend {...defaultProps} />);

      const legend = container.querySelector('.graph-legend');
      expect(legend).toHaveStyle({ maxWidth: '280px' });
    });

    it('has z-index for stacking above graph', () => {
      const { container } = render(<GraphLegend {...defaultProps} />);

      const legend = container.querySelector('.graph-legend');
      expect(legend).toHaveStyle({ zIndex: '10' });
    });

    it('has rounded corners', () => {
      const { container } = render(<GraphLegend {...defaultProps} />);

      const legend = container.querySelector('.graph-legend');
      expect(legend).toHaveClass('rounded-lg');
    });

    it('has shadow for elevation', () => {
      const { container } = render(<GraphLegend {...defaultProps} />);

      const legend = container.querySelector('.graph-legend');
      expect(legend).toHaveClass('shadow-lg');
    });
  });

  describe('Content Descriptions', () => {
    it('document node has correct description', () => {
      render(<GraphLegend {...defaultProps} defaultExpanded />);

      expect(screen.getByText('Markdown file with title, stats, and description')).toBeInTheDocument();
    });

    it('external node has correct description', () => {
      render(<GraphLegend {...defaultProps} defaultExpanded />);

      expect(screen.getByText('External domain with aggregated link count')).toBeInTheDocument();
    });

    it('internal edge has correct description', () => {
      render(<GraphLegend {...defaultProps} defaultExpanded />);

      expect(screen.getByText('Connection between markdown documents')).toBeInTheDocument();
    });

    it('external edge has correct description', () => {
      render(<GraphLegend {...defaultProps} defaultExpanded />);

      expect(screen.getByText('Connection to external domain')).toBeInTheDocument();
    });

    it('selected node has correct description', () => {
      render(<GraphLegend {...defaultProps} defaultExpanded />);

      expect(screen.getByText('Click to select, highlights connections')).toBeInTheDocument();
    });

    it('connected edge has correct description', () => {
      render(<GraphLegend {...defaultProps} defaultExpanded />);

      expect(screen.getByText('Edges to/from selected node')).toBeInTheDocument();
    });
  });

  describe('Chevron Icons', () => {
    it('shows ChevronUp when collapsed (indicating can expand)', () => {
      const { container } = render(<GraphLegend {...defaultProps} />);

      // When collapsed, clicking expands - so show up chevron
      const button = screen.getByRole('button', { name: /legend/i });
      const svgs = button.querySelectorAll('svg');
      expect(svgs.length).toBe(1); // Should have one chevron icon
    });

    it('shows ChevronDown when expanded (indicating can collapse)', () => {
      const { container } = render(<GraphLegend {...defaultProps} defaultExpanded />);

      const button = screen.getByRole('button', { name: /legend/i });
      const svgs = button.querySelectorAll('svg');
      expect(svgs.length).toBe(1); // Should have one chevron icon
    });
  });

  describe('Dynamic Content', () => {
    it('updates when showExternalLinks prop changes', () => {
      const { rerender } = render(<GraphLegend {...defaultProps} defaultExpanded showExternalLinks />);

      // Initially showing external links
      expect(screen.getAllByText('External Link').length).toBe(2);

      // Rerender with external links disabled
      rerender(<GraphLegend {...defaultProps} defaultExpanded showExternalLinks={false} />);

      // External Link should no longer appear
      expect(screen.queryByText('External Link')).not.toBeInTheDocument();
    });

    it('applies theme changes dynamically', () => {
      const { container, rerender } = render(<GraphLegend {...defaultProps} />);

      const legend = container.querySelector('.graph-legend');
      expect(legend).toHaveStyle({ backgroundColor: mockTheme.colors.bgActivity });

      // Rerender with light theme
      rerender(<GraphLegend {...defaultProps} theme={lightTheme} />);

      expect(legend).toHaveStyle({ backgroundColor: lightTheme.colors.bgActivity });
    });
  });
});
