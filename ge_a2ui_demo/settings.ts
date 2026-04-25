import {A2Component} from './types';

/**
 * Component categories list.
 */
export const CATEGORIES = [
  'All Components',
  'Navigation',
  'Forms',
  'Data Display',
  'Feedback',
  'Overlays',
];

/**
 * List of standard components in the library.
 */
export const STANDARD_COMPONENTS: A2Component[] = [
  {
    id: 'button',
    name: 'Button',
    description:
        'Versatile triggers for user actions with multiple variants and states.',
    category: 'General'
  },
  {
    id: 'card',
    name: 'Card',
    description:
        'Containers for grouping content and actions about a single subject.',
    category: 'Data Display'
  },
  {
    id: 'modal',
    name: 'Modal',
    description:
        'Dialog windows for focused interactions without leaving the context.',
    category: 'Overlays'
  },
  {
    id: 'input',
    name: 'Input',
    description:
        'Standard fields for user data entry with validation and icons.',
    category: 'Forms'
  },
  {
    id: 'table',
    name: 'Table',
    description:
        'Structured data displays with sorting, filtering, and pagination.',
    category: 'Data Display'
  },
  {
    id: 'navbar',
    name: 'Navigation',
    description:
        'Headers, sidebars, and breadcrumbs to help users find their way.',
    category: 'Navigation'
  },
  {
    id: 'toast',
    name: 'Toast',
    description:
        'Brief notifications about processes that occur in the background.',
    category: 'Feedback'
  },
  {
    id: 'tabs',
    name: 'Tabs',
    description:
        'Organize content into separate views within the same context.',
    category: 'Navigation'
  },
  {
    id: 'chart',
    name: 'VegaChart',
    description:
        'Visual statistics and analytics visualization with Vega-Lite.',
    category: 'Data Display'
  },
  {
    id: 'product-selection',
    name: 'Product Selection',
    description: 'Displays a list of products in a tabular format.',
    category: 'Input'
  },
];

/**
 * Default JSON payload for the composer view.
 */
export const INITIAL_JSON = {
  type: 'container',
  props: {padding: '40px', gap: '24px', background: 'bg-slate-900'},
  children: [
    {
      type: 'hero',
      props: {
        title: 'The future of design is visual.',
        subtitle:
            'Build beautiful interfaces with our drag-and-drop composer. No coding required, just pure creativity.',
        primaryAction: 'Get Started',
        secondaryAction: 'Learn More'
      }
    },
    {
      type: 'grid',
      props: {
        columns: 3,
        items: [
          {
            title: 'High Performance',
            icon: 'speed',
            text: 'Optimized for speed and accessibility.'
          },
          {
            title: 'Secure by Default',
            icon: 'security',
            text: 'Enterprise grade security built-in.'
          },
          {
            title: 'Magic Features',
            icon: 'auto_awesome',
            text: 'AI-powered suggestions for your UI.'
          }
        ]
      }
    }
  ]
};

/**
 * Tree definition for component categories.
 */
export const CATEGORY_TREE = [
  {name: 'Layout', items: ['Row', 'Column', 'List', 'Card'], open: true},
  {
    name: 'Content',
    items: ['Text', 'Image', 'Icon', 'Video', 'AudioPlayer'],
    open: true
  },
  {
    name: 'Input',
    items: [
      'TextField', 'CheckBox', 'Slider', 'DateTimeInput', 'MultipleChoice',
      'ProductSelection'
    ],
    open: true
  },
  {name: 'Navigation', items: ['Button', 'Tabs', 'Modal'], open: true},
  {name: 'Decoration', items: ['Divider'], open: true},
];

/**
 * Sample A2UI messages for the composer view.
 */
export const SAMPLE_A2UI_MESSAGES =
    JSON.stringify(
        [
          {
            'beginRendering':
                {'surfaceId': 'demo-surface', 'root': 'root-container'}
          },
          {
            surfaceUpdate:
                {
                  surfaceId: 'demo-surface',
                  components:
                      [
                        {
                          id: 'root-container',
                          component: {
                            Column: {
                              children: {
                                explicitList:
                                    ['header', 'text-input', 'submit-button']
                              },
                              distribution: 'start',
                              alignment: 'stretch'
                            }
                          }
                        },
                        {
                          id: 'header',
                          component:
                              {Text: {text: {literalString: 'A2UI Playground'}}}
                        },
                        {
                          id: 'text-input',
                          component:
                              {
                                TextField: {
                                  label:
                                      {literalString: 'Enter something here'},
                                  text: {path: 'demoData/input'}
                                }
                              }
                        },
                        {
                          id: 'submit-button',
                          component:
                              {
                                Button: {
                                  primary: true,
                                  child: 'submit-button-text',
                                  action: {
                                    name: 'submit_demo',
                                    context: [{
                                      key: 'info',
                                      value:
                                          {literalString: 'Demo Button Clicked'}
                                    }]
                                  }
                                }
                              }
                        },
                        {
                          id: 'submit-button-text',
                          component: {Text: {text: {literalString: 'Submit'}}}
                        }
                      ]
                }
          },
          {
            dataModelUpdate:
                {
                  surfaceId: 'demo-surface',
                  contents: [{
                    key: 'demoData',
                    valueMap: [{key: 'input', valueString: 'Initial value'}]
                  }]
                }
          }
        ],
        null, 2);
