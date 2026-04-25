/**
 * Type defining the different views in the demo.
 */
export type View = 'gallery' | 'standard' | 'composer';

/**
 * Interface for A2UI component metadata.
 */
export interface A2Component {
  id: string;
  name: string;
  description: string;
  category: string;
  preview?: string;
}

/**
 * Interface representing an item in the demo.
 */
export interface DemoItem {
  id: string;
  title: string;
  description: string;
  actionButton?: boolean;
}
