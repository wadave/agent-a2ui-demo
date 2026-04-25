import {DemoItem} from './types';
/**
 * Generates predefined messages for the gallery.
 */
function getGalleryMessages(): any[] {
  const messages: any[] = [];

  const galleryDataContent = {
    key: 'galleryData',
    valueMap: [
      {key: 'textField', valueString: 'Hello World'},
      {key: 'checkbox', valueBoolean: false},
      {key: 'checkboxChecked', valueBoolean: true},
      {key: 'slider', valueNumber: 30},
      {key: 'date', valueString: '2025-10-26'},
      {key: 'favorites', valueMap: [{key: '0', valueString: 'A'}]},
      {key: 'favoritesChips', valueMap: []},
      {key: 'favoritesFilter', valueMap: []}, {
        key: 'vegaSpec',
        valueString: JSON.stringify({
          '$schema': 'https://vega.github.io/schema/vega-lite/v5.json',
          'description': 'A simple bar chart with embedded data.',
          'data': {
            'values': [
              {'a': 'A', 'b': 28}, {'a': 'B', 'b': 55}, {'a': 'C', 'b': 43},
              {'a': 'D', 'b': 91}, {'a': 'E', 'b': 81}, {'a': 'F', 'b': 53},
              {'a': 'G', 'b': 19}, {'a': 'H', 'b': 87}, {'a': 'I', 'b': 52}
            ]
          },
          'mark': 'bar',
          'encoding': {
            'x': {'field': 'a', 'type': 'nominal', 'axis': {'labelAngle': 0}},
            'y': {'field': 'b', 'type': 'quantitative'}
          }
        })
      }
    ]
  };

  function addDemoSurface(surfaceId: string, componentDef: any) {
    const rootId = `${surfaceId}-root`;

    const components = [{id: rootId, component: componentDef}];

    messages.push({beginRendering: {surfaceId, root: rootId}});
    messages.push({surfaceUpdate: {surfaceId, components}});

    messages.push(
        {dataModelUpdate: {surfaceId, contents: [galleryDataContent]}});
  }

  // 1. TextField
  addDemoSurface('demo-text', {
    TextField: {
      label: {literalString: 'Enter some text'},
      text: {path: 'galleryData/textField'}
    }
  });

  // 1b. TextField (Regex)
  addDemoSurface('demo-text-regex', {
    TextField: {
      label: {literalString: 'Enter exactly 5 digits'},
      text: {path: 'galleryData/textFieldRegex'},
      validationRegexp: '^\\d{5}$'
    }
  });

  // 2. CheckBox
  addDemoSurface('demo-checkbox', {
    CheckBox: {
      label: {literalString: 'Toggle me'},
      value: {path: 'galleryData/checkbox'}
    }
  });

  // 3. Slider
  addDemoSurface('demo-slider', {
    Slider: {value: {path: 'galleryData/slider'}, minValue: 0, maxValue: 100}
  });

  // 4. DateTimeInput
  addDemoSurface(
      'demo-date',
      {DateTimeInput: {value: {path: 'galleryData/date'}, enableDate: true}});

  // 5. MultipleChoice (Default)
  addDemoSurface('demo-multichoice', {
    MultipleChoice: {
      selections: {path: 'galleryData/favorites'},
      options: [
        {label: {literalString: 'Apple'}, value: 'A'},
        {label: {literalString: 'Banana'}, value: 'B'},
        {label: {literalString: 'Cherry'}, value: 'C'}
      ]
    }
  });

  // 5b. MultipleChoice (Chips)
  addDemoSurface('demo-multichoice-chips', {
    MultipleChoice: {
      selections: {path: 'galleryData/favoritesChips'},
      description: 'Select tags (Chips)',
      variant: 'chips',
      options: [
        {label: {literalString: 'Work'}, value: 'work'},
        {label: {literalString: 'Home'}, value: 'home'},
        {label: {literalString: 'Urgent'}, value: 'urgent'},
        {label: {literalString: 'Later'}, value: 'later'}
      ]
    }
  });

  // 5c. MultipleChoice (Filterable)
  addDemoSurface('demo-multichoice-filter', {
    MultipleChoice: {
      selections: {path: 'galleryData/favoritesFilter'},
      description: 'Select countries (Filterable)',
      filterable: true,
      options: [
        {label: {literalString: 'United States'}, value: 'US'},
        {label: {literalString: 'Canada'}, value: 'CA'},
        {label: {literalString: 'United Kingdom'}, value: 'UK'},
        {label: {literalString: 'Australia'}, value: 'AU'},
        {label: {literalString: 'Germany'}, value: 'DE'},
        {label: {literalString: 'France'}, value: 'FR'},
        {label: {literalString: 'Japan'}, value: 'JP'}
      ]
    }
  });

  // 6. Image
  addDemoSurface('demo-image', {
    Image: {
      url: {literalString: '/assets/google_logo.svg'},
      usageHint: 'mediumFeature'
    }
  });

  // 6b. Image (Avatar)
  addDemoSurface('demo-image-avatar', {
    Image: {
      url: {
        literalString: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop'
      },
      usageHint: 'avatar'
    }
  });

  // 6c. Image (Icon)
  addDemoSurface('demo-image-icon', {
    Image: {url: {literalString: '/assets/workday.svg'}, usageHint: 'icon'}
  });

  // 7. Button
  const buttonSurfaceId = 'demo-button';
  const btnRootId = 'demo-button-root';
  const btnTextId = 'demo-button-text';

  messages.push(
      {beginRendering: {surfaceId: buttonSurfaceId, root: btnRootId}});
  messages.push({
    surfaceUpdate: {
      surfaceId: buttonSurfaceId,
      components: [
        {
          id: btnTextId,
          component: {Text: {text: {literalString: 'Trigger Action'}}}
        },
        {
          id: btnRootId,
          component: {
            Button: {
              child: btnTextId,
              primary: true,
              action: {
                name: 'custom_action',
                context: [
                  {key: 'info', value: {literalString: 'Custom Button Clicked'}}
                ]
              }
            }
          }
        }
      ]
    }
  });

  // 8. Tabs
  const tabsSurfaceId = 'demo-tabs';
  const tabsRootId = 'demo-tabs-root';
  const tab1Id = 'tab-1-content';
  const tab2Id = 'tab-2-content';
  const tab3Id = 'tab-3-content';

  messages.push({beginRendering: {surfaceId: tabsSurfaceId, root: tabsRootId}});
  messages.push({
    surfaceUpdate: {
      surfaceId: tabsSurfaceId,
      components: [
        {
          id: tab1Id,
          component: {Text: {text: {literalString: 'First Tab Content'}}}
        },
        {
          id: tab2Id,
          component: {Text: {text: {literalString: 'Second Tab Content'}}}
        },
        {
          id: tab3Id,
          component: {Text: {text: {literalString: 'Third Tab Content'}}}
        },
        {
          id: tabsRootId,
          component: {
            Tabs: {
              tabItems: [
                {title: {literalString: 'View One'}, child: tab1Id},
                {title: {literalString: 'View Two'}, child: tab2Id},
                {title: {literalString: 'View Three'}, child: tab3Id}
              ]
            }
          }
        }
      ]
    }
  });

  // 9. Icon
  const iconSurfaceId = 'demo-icon';
  messages.push(
      {beginRendering: {surfaceId: iconSurfaceId, root: 'icon-root'}});
  messages.push({
    surfaceUpdate: {
      surfaceId: iconSurfaceId,
      components: [
        {
          id: 'icon-root',
          component: {
            Row: {
              children: {explicitList: ['icon-1', 'icon-2', 'icon-3']},
              distribution: 'spaceEvenly',
              alignment: 'center'
            }
          }
        },
        {id: 'icon-1', component: {Icon: {name: {literalString: 'star'}}}},
        {id: 'icon-2', component: {Icon: {name: {literalString: 'home'}}}},
        {id: 'icon-3', component: {Icon: {name: {literalString: 'settings'}}}}
      ]
    }
  });

  // 10. Divider
  const divSurfaceId = 'demo-divider';
  messages.push({beginRendering: {surfaceId: divSurfaceId, root: 'div-root'}});
  messages.push({
    surfaceUpdate: {
      surfaceId: divSurfaceId,
      components: [
        {
          id: 'div-root',
          component: {
            Column: {
              children:
                  {explicitList: ['div-text-1', 'div-horiz', 'div-text-2']},
              distribution: 'start',
              alignment: 'stretch'
            }
          }
        },
        {
          id: 'div-text-1',
          component: {Text: {text: {literalString: 'Above Divider'}}}
        },
        {id: 'div-horiz', component: {Divider: {axis: 'horizontal'}}}, {
          id: 'div-text-2',
          component: {Text: {text: {literalString: 'Below Divider'}}}
        }
      ]
    }
  });

  // 11. Card
  const cardSurfaceId = 'demo-card';
  messages.push(
      {beginRendering: {surfaceId: cardSurfaceId, root: 'card-root'}});
  messages.push({
    surfaceUpdate: {
      surfaceId: cardSurfaceId,
      components: [
        {id: 'card-root', component: {Card: {child: 'card-text'}}}, {
          id: 'card-text',
          component: {Text: {text: {literalString: 'I am inside a Card'}}}
        }
      ]
    }
  });

  // 12. Video
  addDemoSurface('demo-video', {
    Video: {
      url: {
        literalString:
            'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
      }
    }
  });

  // 13. Modal
  const modalSurfaceId = 'demo-modal';
  messages.push(
      {beginRendering: {surfaceId: modalSurfaceId, root: 'modal-root'}});
  messages.push({
    surfaceUpdate: {
      surfaceId: modalSurfaceId,
      components: [
        {
          id: 'modal-root',
          component: {
            Modal: {entryPointChild: 'modal-btn', contentChild: 'modal-content'}
          }
        },
        {
          id: 'modal-btn',
          component: {
            Button: {
              child: 'modal-btn-text',
              primary: false,
              action: {name: 'noop'}
            }
          }
        },
        {
          id: 'modal-btn-text',
          component: {Text: {text: {literalString: 'Open Modal'}}}
        },
        {
          id: 'modal-content',
          component:
              {Text: {text: {literalString: 'This is the modal content!'}}}
        }
      ]
    }
  });

  // 14. List
  const listSurfaceId = 'demo-list';
  messages.push(
      {beginRendering: {surfaceId: listSurfaceId, root: 'list-root'}});
  messages.push({
    surfaceUpdate: {
      surfaceId: listSurfaceId,
      components: [
        {
          id: 'list-root',
          component: {
            List: {
              children:
                  {explicitList: ['list-item-1', 'list-item-2', 'list-item-3']},
              direction: 'vertical',
              alignment: 'stretch'
            }
          }
        },
        {
          id: 'list-item-1',
          component: {Text: {text: {literalString: 'Item 1'}}}
        },
        {
          id: 'list-item-2',
          component: {Text: {text: {literalString: 'Item 2'}}}
        },
        {
          id: 'list-item-3',
          component: {Text: {text: {literalString: 'Item 3'}}}
        }
      ]
    }
  });

  // 15. Text
  const textSurfaceId = 'demo-text-styles';
  messages.push(
      {beginRendering: {surfaceId: textSurfaceId, root: 'text-styles-root'}});
  messages.push({
    surfaceUpdate: {
      surfaceId: textSurfaceId,
      components: [
        {
          id: 'text-styles-root',
          component: {
            Column: {
              children: {
                explicitList: [
                  'text-h1', 'text-h2', 'text-h3', 'text-h4', 'text-h5',
                  'text-body', 'text-caption'
                ]
              },
              distribution: 'start',
              alignment: 'stretch'
            }
          }
        },
        {
          id: 'text-h1',
          component:
              {Text: {text: {literalString: 'H1 Header'}, usageHint: 'h1'}}
        },
        {
          id: 'text-h2',
          component:
              {Text: {text: {literalString: 'H2 Header'}, usageHint: 'h2'}}
        },
        {
          id: 'text-h3',
          component:
              {Text: {text: {literalString: 'H3 Header'}, usageHint: 'h3'}}
        },
        {
          id: 'text-h4',
          component:
              {Text: {text: {literalString: 'H4 Header'}, usageHint: 'h4'}}
        },
        {
          id: 'text-h5',
          component:
              {Text: {text: {literalString: 'H5 Header'}, usageHint: 'h5'}}
        },
        {
          id: 'text-body',
          component:
              {Text: {text: {literalString: 'Body text.'}, usageHint: 'body'}}
        },
        {
          id: 'text-caption',
          component: {
            Text: {text: {literalString: 'Caption text.'}, usageHint: 'caption'}
          }
        },
      ]
    }
  });

  // 16. AudioPlayer
  addDemoSurface('demo-audio', {
    AudioPlayer: {
      url: {literalString: '/assets/audio.mp3'},
      description: {literalString: 'Local Audio Sample'}
    }
  });

  // 17. ProductSelection
  addDemoSurface('demo-product-selection', {
    ProductSelection: {
      productTableTitle: 'Deal Products Configuration',
      confirmLabel: 'Apply Changes',
      cancelLabel: 'Discard',
      columns: [
        {key: 'name', label: 'Product Name', type: 'string', editable: false},
        {key: 'qty', label: 'Quantity', type: 'number', editable: true},
        {
          key: 'discount',
          label: 'Discount (%)',
          type: 'decimal',
          editable: true
        },
        {
          key: 'deliveryDate',
          label: 'Delivery Date',
          type: 'date',
          editable: true
        },
        {
          key: 'status',
          label: 'Status',
          type: 'picklist',
          editable: true,
          options: ['Draft', 'Confirmed', 'Shipped']
        },
      ],
      rows: [
        {
          name: 'Pixel 8 Pro',
          qty: 2,
          discount: 10.5,
          deliveryDate: '2026-05-01',
          status: 'Draft'
        },
        {
          name: 'Pixel Watch 2',
          qty: 1,
          discount: 0,
          deliveryDate: '2026-05-10',
          status: 'Draft'
        },
        {
          name: 'Pixel Buds Pro',
          qty: 3,
          discount: 15.0,
          deliveryDate: '2026-05-15',
          status: 'Draft'
        },
      ]
    }
  });

  // Response Surface
  messages.push(
      {beginRendering: {surfaceId: 'response-surface', root: 'response-text'}});
  messages.push({
    surfaceUpdate: {
      surfaceId: 'response-surface',
      components: [{
        id: 'response-text',
        component: {
          Text: {
            text: {
              literalString:
                  'Interact with the gallery to see responses. This view is updated by the agent by relaying the raw action commands it received from the client'
            }
          }
        }
      }]
    }
  });

  return messages;
}

/**
 * Pre-generated gallery messages.
 */
export const GALLERY_MESSAGES = getGalleryMessages();


/**
 * Metadata items for the demo components.
 */
export const DEMO_ITEMS: DemoItem[] = [
  {
    id: 'demo-text',
    title: 'TextField',
    description: 'Allows user to enter text. Supports binding to data model.',
    actionButton: true
  },
  {
    id: 'demo-text-regex',
    title: 'TextField (Regex)',
    description: 'TextField with 5-digit regex validation.',
    actionButton: true
  },
  {
    id: 'demo-checkbox',
    title: 'CheckBox',
    description: 'A binary toggle.',
    actionButton: true
  },
  {
    id: 'demo-slider',
    title: 'Slider',
    description: 'Select a value from a range.',
    actionButton: true
  },
  {
    id: 'demo-date',
    title: 'DateTimeInput',
    description: 'Pick a date or time.',
    actionButton: true
  },
  {
    id: 'demo-multichoice',
    title: 'MultipleChoice',
    description: 'Select valid options from a list.',
    actionButton: true
  },
  {
    id: 'demo-multichoice-chips',
    title: 'MultipleChoice (Chips)',
    description: 'Select options using chips.',
    actionButton: true
  },
  {
    id: 'demo-multichoice-filter',
    title: 'MultipleChoice (Filterable)',
    description: 'Search and filter options.',
    actionButton: true
  },
  {
    id: 'demo-image',
    title: 'Image',
    description: 'Displays an image from a URL.'
  },
  {
    id: 'demo-image-avatar',
    title: 'Image (Avatar)',
    description: 'Image formatted as an avatar.'
  },
  {
    id: 'demo-image-icon',
    title: 'Image (Icon)',
    description: 'Image formatted as an icon.'
  },
  {
    id: 'demo-button',
    title: 'Button',
    description: 'Triggers a client-side action.'
  },
  {
    id: 'demo-tabs',
    title: 'Tabs',
    description: 'Switch between different views.'
  },
  {id: 'demo-icon', title: 'Icon', description: 'Standard icons.'},
  {id: 'demo-divider', title: 'Divider', description: 'Visual separation.'},
  {
    id: 'demo-card',
    title: 'Card',
    description: 'A container for other components.'
  },
  {id: 'demo-video', title: 'Video', description: 'Video player.'},
  {id: 'demo-modal', title: 'Modal', description: 'Overlay dialog.'},
  {id: 'demo-list', title: 'List', description: 'Vertical or horizontal list.'},
  {
    id: 'demo-text-styles',
    title: 'Text',
    description: 'Text with different styles.'
  },
  {id: 'demo-audio', title: 'AudioPlayer', description: 'Play audio content.'},
  {
    id: 'demo-product-selection',
    title: 'Product Selection',
    description: 'Displays a list of products in a table.'
  },
];
