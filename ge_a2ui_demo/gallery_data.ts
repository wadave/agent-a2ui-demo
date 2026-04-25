import {GALLERY_MESSAGES} from './component_data';
import {RAINDROP_HTML} from './raindrop-html';

export interface GalleryData {
  id: string;
  title: string;
  description: string;
  message: any[];
}

export const GALLERY_DATA: GalleryData[] = [
  {
    id: 'signal-iduna-form',
    title: 'Signal Iduna Form',
    description: 'Dropdown menu to allow users to select insurance tafiffs.',
    message: [
      {
        'beginRendering':
            {'surfaceId': 'traiff-selection-surface', 'root': 'root'}
      },
      {
        'surfaceUpdate': {
          'surfaceId': 'traiff-selection-surface',
          'components': [
            {'id': 'root', 'component': {'Card': {'child': 'cardContent'}}}, {
              'id': 'cardContent',
              'component': {
                'Column': {
                  'children': {
                    'explicitList': [
                      'multiDropdown', 'customerId', 'policyNumber', 'buttonRow'
                    ]
                  },
                  'distribution': 'start',
                  'alignment': 'stretch'
                }
              }
            },
            {
              'id': 'multiDropdown',
              'component': {
                'MultipleChoice': {
                  'selections': {'path': '/form/dropdownSelections'},
                  'filterable': true,
                  'placeholder': 'Select tariffs...',
                  'options': [
                    {
                      'label': {
                        'literalString':
                            'Ad Valorem Tariff (Percentage based on value)'
                      },
                      'value': 'Ad Valorem Tariff (Percentage based on value)'
                    },
                    {
                      'label': {
                        'literalString':
                            'Specific Tariff (Fixed fee per unit/weight)2'
                      },
                      'value': 'Specific Tariff (Fixed fee per unit/weight)2'
                    },
                    {
                      'label': {
                        'literalString':
                            'Compound Tariff (Mix of Ad Valorem and Specific)'
                      },
                      'value': 'compound_tariff'
                    },
                    {
                      'label': {
                        'literalString':
                            'Tariff-Rate Quota (TRQ) (Lower rate for first X units, higher after)'
                      },
                      'value':
                          'Tariff-Rate Quota (TRQ) (Lower rate for first X units, higher after)'
                    },
                    {
                      'label': {
                        'literalString':
                            'Most Favored Nation (MFN) Rate (Standard WTO rate)'
                      },
                      'value':
                          'Most Favored Nation (MFN) Rate (Standard WTO rate)'
                    },
                    {
                      'label': {
                        'literalString':
                            'Anti-Dumping Duty (On goods sold below fair market value)'
                      },
                      'value':
                          'Anti-Dumping Duty (On goods sold below fair market value)'
                    },
                    {
                      'label': {
                        'literalString':
                            'Countervailing Duty (On subsidized imports)'
                      },
                      'value': 'Countervailing Duty (On subsidized imports)'
                    },
                    {
                      'label': {
                        'literalString':
                            'Revenue Tariff (To generate government income)'
                      },
                      'value': 'Revenue Tariff (To generate government income)'
                    },
                    {
                      'label': {
                        'literalString':
                            'Protective Tariff (To help domestic industries)'
                      },
                      'value': 'Protective Tariff (To help domestic industries)'
                    },
                    {
                      'label': {
                        'literalString':
                            'Bound Tariff (The maximum rate a country has committed to WTO)'
                      },
                      'value':
                          'Bound Tariff (The maximum rate a country has committed to WTO)'
                    },
                    {
                      'label': {
                        'literalString':
                            'Flat Rate Tariff (Same rate regardless of usage)'
                      },
                      'value':
                          'Flat Rate Tariff (Same rate regardless of usage)'
                    },
                    {
                      'label': {
                        'literalString':
                            'Standard Variable Tariff (SVT) (Price fluctuates with market)'
                      },
                      'value':
                          'Standard Variable Tariff (SVT) (Price fluctuates with market)'
                    },
                    {
                      'label': {
                        'literalString':
                            'Fixed Rate Tariff (Locked-in price for 12–24 months)'
                      },
                      'value':
                          'Fixed Rate Tariff (Locked-in price for 12–24 months)'
                    },
                    {
                      'label': {
                        'literalString':
                            'Block Rate Tariff (Price changes after a certain usage threshold)'
                      },
                      'value':
                          'Block Rate Tariff (Price changes after a certain usage threshold)'
                    }
                  ],
                  'maxAllowedSelections': 3
                }
              }
            },
            {
              'id': 'customerId',
              'component': {
                'TextField': {
                  'label': {'literalString': 'Customer ID (7 digits)'},
                  'text': {'path': '/form/customerId'},
                  'textFieldType': 'shortText',
                  'validationRegexp': '^\\d{7}$'
                }
              }
            },
            {
              'id': 'policyNumber',
              'component': {
                'TextField': {
                  'label': {'literalString': 'Policy Number (10 digits)'},
                  'text': {'path': '/form/policyNumber'},
                  'textFieldType': 'shortText',
                  'validationRegexp': '^\\d{10}$'
                }
              }
            },
            {
              'id': 'buttonRow',
              'component': {
                'Row': {
                  'children': {'explicitList': ['showDetailsButton']},
                  'distribution': 'end'
                }
              }
            },
            {
              'id': 'showDetailsButton',
              'component': {
                'Button': {
                  'child': 'showDetailsButtonText',
                  'action': {
                    'name': 'selectTariffs',
                    'context': [
                      {
                        'key': 'selectedTariffs',
                        'value': {'path': '/form/dropdownSelections'}
                      },
                      {
                        'key': 'selectedPolicyNumber',
                        'value': {'path': '/form/policyNumber'}
                      },
                      {
                        'key': 'selectedCustomerId',
                        'value': {'path': '/form/customerId'}
                      }
                    ]
                  }
                }
              }
            },
            {
              'id': 'showDetailsButtonText',
              'component': {'Text': {'text': {'literalString': 'Show details'}}}
            }
          ]
        }
      }
    ]
  },
  {
    id: 'contact-card',
    title: 'Contact Card',
    description: 'A detailed contact card with profile image and contact info.',
    message: [
      {'beginRendering': {'surfaceId': 'contact-card', 'root': 'main_card'}}, {
        'surfaceUpdate': {
          'surfaceId': 'contact-card',
          'components': [
            {
              'id': 'main_card',
              'component': {'Card': {'child': 'main_column'}}
            },
            {
              'id': 'main_column',
              'component': {
                'Column': {
                  'children': {
                    'explicitList': [
                      'profile_image_column', 'description_column', 'div',
                      'info_rows_column', 'action_buttons_row',
                      'link_text_wrapper'
                    ]
                  },
                  'alignment': 'stretch'
                }
              }
            },
            {
              'id': 'profile_image_column',
              'component': {
                'Column': {
                  'children': {'explicitList': ['profile_image']},
                  'alignment': 'center'
                }
              }
            },
            {
              'id': 'profile_image',
              'component': {
                'Image': {
                  'url': {'path': 'imageUrl'},
                  'usageHint': 'avatar',
                  'fit': 'cover'
                }
              }
            },
            {
              'id': 'user_heading',
              'weight': 1,
              'component':
                  {'Text': {'text': {'path': 'name'}, 'usageHint': 'h2'}}
            },
            {
              'id': 'description_text_1',
              'component':
                  {'Text': {'text': {'path': 'title'}, 'usageHint': 'h4'}}
            },
            {
              'id': 'description_text_2',
              'component':
                  {'Text': {'text': {'path': 'team'}, 'usageHint': 'caption'}}
            },
            {
              'id': 'description_column',
              'component': {
                'Column': {
                  'children': {
                    'explicitList': [
                      'user_heading', 'description_text_1', 'description_text_2'
                    ]
                  },
                  'alignment': 'center'
                }
              }
            },
            {
              'id': 'calendar_icon',
              'component':
                  {'Icon': {'name': {'literalString': 'calendar_today'}}}
            },
            {
              'id': 'calendar_secondary_text',
              'component':
                  {'Text': {'usageHint': 'h5', 'text': {'path': 'calendar'}}}
            },
            {
              'id': 'calendar_primary_text',
              'component': {
                'Text': {
                  'text': {'literalString': 'Calendar'},
                  'usageHint': 'caption',
                }
              }
            },
            {
              'id': 'calendar_text_column',
              'component': {
                'Column': {
                  'children': {
                    'explicitList':
                        ['calendar_primary_text', 'calendar_secondary_text']
                  },
                  'distribution': 'start',
                  'alignment': 'start'
                }
              }
            },
            {
              'id': 'info_row_1',
              'component': {
                'Row': {
                  'children': {
                    'explicitList': ['calendar_icon', 'calendar_text_column']
                  },
                  'distribution': 'start',
                  'alignment': 'start'
                }
              }
            },
            {
              'id': 'location_icon',
              'component': {'Icon': {'name': {'literalString': 'location_on'}}}
            },
            {
              'id': 'location_secondary_text',
              'component':
                  {'Text': {'usageHint': 'h5', 'text': {'path': 'location'}}}
            },
            {
              'id': 'location_primary_text',
              'component': {
                'Text': {
                  'text': {'literalString': 'Location'},
                  'usageHint': 'caption'
                }
              }
            },
            {
              'id': 'location_text_column',
              'component': {
                'Column': {
                  'children': {
                    'explicitList':
                        ['location_primary_text', 'location_secondary_text']
                  },
                  'distribution': 'start',
                  'alignment': 'start'
                }
              }
            },
            {
              'id': 'info_row_2',
              'component': {
                'Row': {
                  'children': {
                    'explicitList': ['location_icon', 'location_text_column']
                  },
                  'distribution': 'start',
                  'alignment': 'start'
                }
              }
            },
            {
              'id': 'mail_icon',
              'component': {'Icon': {'name': {'literalString': 'mail'}}}
            },
            {
              'id': 'mail_secondary_text',
              'component':
                  {'Text': {'usageHint': 'h5', 'text': {'path': 'email'}}}
            },
            {
              'id': 'mail_primary_text',
              'component': {
                'Text':
                    {'text': {'literalString': 'Email'}, 'usageHint': 'caption'}
              }
            },
            {
              'id': 'mail_text_column',
              'component': {
                'Column': {
                  'children': {
                    'explicitList': ['mail_primary_text', 'mail_secondary_text']
                  },
                  'distribution': 'start',
                  'alignment': 'start'
                }
              }
            },
            {
              'id': 'info_row_3',
              'component': {
                'Row': {
                  'children':
                      {'explicitList': ['mail_icon', 'mail_text_column']},
                  'distribution': 'start',
                  'alignment': 'start'
                }
              }
            },
            {'id': 'div', 'component': {'Divider': {}}},
            {
              'id': 'call_icon',
              'component': {'Icon': {'name': {'literalString': 'call'}}}
            },
            {
              'id': 'call_secondary_text',
              'component':
                  {'Text': {'usageHint': 'h5', 'text': {'path': 'mobile'}}}
            },
            {
              'id': 'call_primary_text',
              'component': {
                'Text': {
                  'text': {'literalString': 'Mobile'},
                  'usageHint': 'caption'
                }
              }
            },
            {
              'id': 'call_text_column',
              'component': {
                'Column': {
                  'children': {
                    'explicitList': ['call_primary_text', 'call_secondary_text']
                  },
                  'distribution': 'start',
                  'alignment': 'start'
                }
              }
            },
            {
              'id': 'info_row_4',
              'component': {
                'Row': {
                  'children':
                      {'explicitList': ['call_icon', 'call_text_column']},
                  'distribution': 'start',
                  'alignment': 'start'
                }
              }
            },
            {
              'id': 'info_rows_column',
              'weight': 1,
              'component': {
                'Column': {
                  'children': {
                    'explicitList':
                        ['info_row_1', 'info_row_2', 'info_row_3', 'info_row_4']
                  },
                  'alignment': 'stretch'
                }
              }
            },
            {
              'id': 'button_1_text',
              'component': {'Text': {'text': {'literalString': 'Follow'}}}
            },
            {
              'id': 'button_1',
              'component': {
                'Button': {
                  'child': 'button_1_text',
                  'primary': true,
                  'action': {'name': 'follow_contact'}
                }
              }
            },
            {
              'id': 'button_2_text',
              'component': {'Text': {'text': {'literalString': 'Message'}}}
            },
            {
              'id': 'button_2',
              'component': {
                'Button': {
                  'child': 'button_2_text',
                  'primary': false,
                  'action': {'name': 'send_message'}
                }
              }
            },
            {
              'id': 'action_buttons_row',
              'component': {
                'Row': {
                  'children': {'explicitList': ['button_1', 'button_2']},
                  'distribution': 'center',
                  'alignment': 'center'
                }
              }
            },
            {
              'id': 'link_text',
              'component': {
                'Text':
                    {'text': {'literalString': '[View Full Profile](/profile)'}}
              }
            },
            {
              'id': 'link_text_wrapper',
              'component': {
                'Row': {
                  'children': {'explicitList': ['link_text']},
                  'distribution': 'center',
                  'alignment': 'center'
                }
              }
            }
          ]
        }
      },
      {
        'dataModelUpdate': {
          'surfaceId': 'contact-card',
          'path': '/',
          'contents': [
            {'key': 'name', 'valueString': 'John Doe'},
            {'key': 'title', 'valueString': 'Software Engineer'},
            {'key': 'team', 'valueString': 'Cloud AI'},
            {'key': 'location', 'valueString': 'Sunnyvale, CA'},
            {'key': 'email', 'valueString': 'john.doe@example.com'},

            {'key': 'mobile', 'valueString': '(123) 456-7890'},
            {'key': 'calendar', 'valueString': 'Available until 5:00 PM PST'}, {
              'key': 'imageUrl',
              'valueString':
                  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop'
            }
          ]
        }
      }
    ]
  },
  {
    id: 'hero-section',
    title: 'Hero Section',
    description:
        'A responsive hero section with a title, subtitle, and primary call to action.',
    message: [
      {
        surfaceUpdate: {
          surfaceId: 'hero',
          components: [
            {
              id: 'hero-root',
              component: {
                Column: {
                  children: {
                    explicitList: ['hero-title', 'hero-subtitle', 'hero-action']
                  },
                  distribution: 'center',
                  alignment: 'center'
                }
              }
            },
            {
              id: 'hero-title',
              component: {
                Text:
                    {text: {literalString: 'Welcome to A2UI'}, usageHint: 'h1'}
              }
            },
            {
              id: 'hero-subtitle',
              component: {
                Text: {
                  text: {
                    literalString:
                        'Build beautiful, responsive user interfaces with ease.'
                  },
                  usageHint: 'body'
                }
              }
            },
            {
              id: 'hero-action',
              component: {
                Button: {
                  child: 'hero-action-text',
                  primary: true,
                  action: {name: 'get_started'}
                }
              }
            },
            {
              id: 'hero-action-text',
              component: {Text: {text: {literalString: 'Get Started'}}}
            }
          ]
        }
      },
      {beginRendering: {surfaceId: 'hero', root: 'hero-root'}}
    ]
  },
  {
    id: 'login-form',
    title: 'Login Form',
    description:
        'A standard login form with email and password fields, and a submit button.',
    message: [
      {
        surfaceUpdate: {
          surfaceId: 'login-form',
          components: [
            {id: 'login-root', component: {Card: {child: 'login-column'}}}, {
              id: 'login-column',
              component: {
                Column: {
                  children: {
                    explicitList: [
                      'login-title', 'login-email', 'login-password',
                      'login-submit'
                    ]
                  },
                  distribution: 'start',
                  alignment: 'stretch'
                }
              }
            },
            {
              id: 'login-title',
              component:
                  {Text: {text: {literalString: 'Sign In'}, usageHint: 'h3'}}
            },
            {
              id: 'login-email',
              component: {
                TextField: {
                  label: {literalString: 'Email'},
                  type: 'email',
                  text: {path: 'login/email'}
                }
              }
            },
            {
              id: 'login-password',
              component: {
                TextField: {
                  label: {literalString: 'Password'},
                  type: 'password',
                  text: {path: 'login/password'}
                }
              }
            },
            {
              id: 'login-submit',
              component: {
                Button: {
                  child: 'login-submit-text',
                  primary: true,
                  action: {name: 'login_action'}
                }
              }
            },
            {
              id: 'login-submit-text',
              component: {Text: {text: {literalString: 'Sign In'}}}
            }
          ]
        }
      },
      {beginRendering: {surfaceId: 'login-form', root: 'login-root'}}
    ]
  },
  {
    id: 'webframe-demo',
    title: 'WebFrameUrl (iframe) with URL',
    description: 'A demo of the iframe with URL component.',
    message: [
      {
        'beginRendering': {'surfaceId': 'webFrameDemoUrl', 'root': 'mainColumn'}
      },
      {
        'surfaceUpdate': {
          'surfaceId': 'webFrameDemoUrl',
          'components': [
            {
              'id': 'mainColumn',
              'component': {
                'Column': {
                  'children': {'explicitList': ['frame']},
                  'distribution': 'stretch',
                  'alignment': 'stretch'
                }
              }
            },
            {
              'id': 'frame',
              'component': {
                'WebFrameUrl': {
                  'url': {
                    'literalString':
                        'https://maps.google.com/maps?width=600&height=400&hl=en&q=Standford+University&t=&z=14&ie=UTF8&iwloc=B&output=embed'
                  }
                }
              }
            }
          ]
        }
      }
    ]
  },
  {
    id: 'webframe-demo-html',
    title: 'WebFrameSrcdoc (iframe) with HTML',
    description: 'A demo of the WebFrameSrcdoc with purely HTML content.',
    message: [
      {
        'beginRendering':
            {'surfaceId': 'webFrameDemoHtml', 'root': 'mainColumn'}
      },
      {
        'surfaceUpdate': {
          'surfaceId': 'webFrameDemoHtml',
          'components': [
            {
              'id': 'mainColumn',
              'component': {
                'Column': {
                  'children': {'explicitList': ['frame']},
                  'distribution': 'start',
                  'alignment': 'stretch'
                }
              }
            },
            {
              'id': 'frame',
              'component': {
                'WebFrameSrcdoc':
                    {'htmlContent': {'literalString': `${RAINDROP_HTML}`}}
              }
            }
          ]
        }
      }
    ]
  },
  {
    id: 'leave-application',
    title: 'Leave Application',
    description: 'A comprehensive form for requesting time off.',
    message: [
      {
        'beginRendering':
            {'surfaceId': 'leaveApplication', 'root': 'mainColumn'}
      },
      {
        'surfaceUpdate': {
          'surfaceId': 'leaveApplication',
          'components': [
            {
              'id': 'mainColumn',
              'component': {
                'Column': {
                  'children': {'explicitList': ['topCard', 'bottomCard']},
                  'distribution': 'start',
                  'alignment': 'stretch'
                }
              }
            },
            {
              'id': 'topCard',
              'component': {'Card': {'child': 'topCardContentColumn'}}
            },
            {
              'id': 'topCardContentColumn',
              'component': {
                'Column': {
                  'children': {
                    'explicitList': [
                      'headerRow', 'div-horiz-1', 'titleText', 'infoText',
                      'dateTimeRow', 'dailyQuantityAndTypeRow',
                      'commentSectionColumn', 'approvalRow', 'div-horiz-2',
                      'submitButtonRow'
                    ]
                  },
                  'distribution': 'start',
                  'alignment': 'stretch'
                }
              }
            },
            {
              'id': 'headerRow',
              'component': {
                'Row': {
                  'children':
                      {'explicitList': ['workdayIconImg', 'textHeaderTitle']},
                  'distribution': 'start',
                  'alignment': 'start'
                }
              }
            },
            {
              'id': 'workdayIconImg',
              'component': {
                'Image': {
                  'url': {literalString: '/assets/workday.svg'},
                  'usageHint': 'icon',
                  'fit': 'cover'
                }
              }
            },
            {
              'id': 'textHeaderTitle',
              'component': {
                'Text': {
                  'text': {'literalString': 'Workday'},
                  'usageHint': 'caption'
                }
              }
            },
            {
              'id': 'div-horiz-1',
              'component': {'Divider': {'axis': 'horizontal'}}
            },
            {
              'id': 'titleText',
              'component': {
                'Text': {
                  'text': {'literalString': 'Leave Request'},
                  'usageHint': 'h3'
                }
              }
            },
            {
              'id': 'infoText',
              'component': {
                'Text': {
                  'text': {
                    'literalString':
                        'Fill out the form below to request time off from work.'
                  },
                  'usageHint': 'caption'
                }
              }
            },
            {
              'id': 'dateTimeRow',
              'component': {
                'Row': {
                  'children':
                      {'explicitList': ['startDateGroup', 'endDateGroup']},
                  'distribution': 'spaceBetween',
                  'alignment': 'start'
                }
              }
            },
            {
              'id': 'startDateGroup',
              'component': {
                'Column': {
                  'children': {'explicitList': ['inputStartDate']},
                  'alignment': 'start'
                }
              },
              'weight': 1
            },
            {
              'id': 'inputStartDate',
              'component': {
                'DateTimeInput': {
                  'label': {'literalString': 'Start Date'},
                  'value': {'path': '/request/startDate'},
                  'enableDate': true,
                  'enableTime': false,
                }
              }
            },
            {
              'id': 'endDateGroup',
              'component': {
                'Column': {
                  'children': {'explicitList': ['inputEndDate']},
                  'alignment': 'start'
                }
              },
              'weight': 1
            },
            {
              'id': 'inputEndDate',
              'component': {
                'DateTimeInput': {
                  'label': {'literalString': 'End Date'},
                  'value': {'path': '/request/endDate'},
                  'enableDate': true,
                  'enableTime': false,
                }
              }
            },
            {
              'id': 'dailyQuantityAndTypeRow',
              'component': {
                'Row': {
                  'children': {
                    'explicitList': ['dailyQuantityGroup', 'typeDropdownGroup']
                  },
                  'distribution': 'spaceBetween',
                  'alignment': 'start'
                }
              }
            },
            {
              'id': 'dailyQuantityGroup',
              'component': {
                'Column': {
                  'children': {
                    'explicitList': ['labelDailyQuantity', 'inputDailyQuantity']
                  },
                  'alignment': 'start',
                  'distribution': 'spaceBetween'
                }
              },
              'weight': 1
            },
            {
              'id': 'labelDailyQuantity',
              'component': {
                'Text': {'text': {'literalString': 'Daily quantity (Hours)'}}
              }
            },
            {
              'id': 'inputDailyQuantity',
              'component': {
                'TextField': {
                  'label': {'literalString': 'Hours'},
                  'textFieldType': 'number',
                  'text': {'path': '/request/dailyQuantityHours'}
                }
              }
            },
            {
              'id': 'typeDropdownGroup',
              'component': {
                'Column': {
                  'children': {'explicitList': ['labelType', 'typeDropdown']},
                  'alignment': 'start'
                }
              },
              'weight': 1
            },
            {
              'id': 'labelType',
              'component': {'Text': {'text': {'literalString': 'Type'}}}
            },
            {
              'id': 'typeDropdown',
              'component': {
                'MultipleChoice': {
                  'selections': {'path': '/request/leaveType'},
                  'options': [
                    {
                      'label': {'literalString': 'Vacation'},
                      'value': 'vacation'
                    },
                    {
                      'label': {'literalString': 'Jury Duty'},
                      'value': 'juryDuty'
                    },
                    {
                      'label': {'literalString': 'Unpaid Time Off'},
                      'value': 'unpaidTimeOff'
                    }
                  ],
                  'maxAllowedSelections': 1
                }
              }
            },
            {
              'id': 'commentSectionColumn',
              'component': {
                'Column': {
                  'children':
                      {'explicitList': ['labelComments', 'inputComments']},
                  'alignment': 'stretch'
                }
              }
            },
            {
              'id': 'labelComments',
              'component': {'Text': {'text': {'literalString': 'Comments'}}}
            },
            {
              'id': 'inputComments',
              'component': {
                'TextField': {
                  'label': {'literalString': 'Enter comments here'},
                  'textFieldType': 'longText',
                  'text': {'path': '/request/comments'}
                }
              }
            },
            {
              'id': 'approvalRow',
              'component': {
                'Row': {
                  'children':
                      {'explicitList': ['iconInfo', 'textApprovalMessage']},
                  'distribution': 'start',
                  'alignment': 'center'
                }
              }
            },
            {
              'id': 'iconInfo',
              'component': {'Icon': {'name': {'literalString': 'info'}}}
            },
            {
              'id': 'textApprovalMessage',
              'component': {
                'Text': {
                  'text': {
                    'literalString':
                        'Your request will be submitted to your manager for approval.'
                  },
                  'usageHint': 'caption'
                }
              }
            },
            {
              'id': 'div-horiz-2',
              'component': {'Divider': {'axis': 'horizontal'}}
            },
            {
              'id': 'buttonTextSubmit',
              'component': {'Text': {'text': {'literalString': 'Submit'}}}
            },
            {
              'id': 'submitButton',
              'component': {
                'Button': {
                  'child': 'buttonTextSubmit',
                  'action': {'name': 'submitLeaveRequest'}
                }
              }
            },
            {
              'id': 'submitButtonRow',
              'component': {
                'Row': {
                  'children': {'explicitList': ['submitButton']},
                  'distribution': 'center'
                }
              }
            },
            {
              'id': 'bottomCard',
              'component': {'Card': {'child': 'bottomCardContentRow'}}
            },
            {
              'id': 'bottomCardContentRow',
              'component': {
                'Row': {
                  'children': {
                    'explicitList':
                        ['iconHelp', 'textNeedHelp', 'buttonContactHR']
                  },
                  'distribution': 'spaceBetween',
                  'alignment': 'center'
                }
              }
            },
            {
              'id': 'iconHelp',
              'component': {'Icon': {'name': {'literalString': 'help'}}}
            },
            {
              'id': 'textNeedHelp',
              'component': {
                'Text':
                    {'text': {'literalString': 'Need help with your request?'}}
              }
            },
            {
              'id': 'buttonTextContactHR',
              'component': {'Text': {'text': {'literalString': 'Contact HR'}}}
            },
            {
              'id': 'buttonContactHR',
              'component': {
                'Button': {
                  'child': 'buttonTextContactHR',
                  'action': {'name': 'contactHumanResources'}
                }
              }
            }
          ]
        }
      },
      {
        'dataModelUpdate': {
          'surfaceId': 'leaveApplication',
          'contents': [{
            'key': 'request',
            'valueMap': [
              {'key': 'startDate', 'valueString': '2024-07-22'},
              {'key': 'endDate', 'valueString': '2024-07-26'},
              {'key': 'dailyQuantityHours', 'valueNumber': 8}, {
                'key': 'leaveType',
                'valueMap': [{'key': '0', 'valueString': 'vacation'}]
              },
              {'key': 'comments', 'valueString': ''}
            ]
          }]
        }
      }
    ]
  },
  {
    id: 'vega-chart-demo',
    title: 'Vega Chart (Custom Component)',
    description: 'A bar chart rendered using Vega-Lite.',
    message: [
      {
        surfaceUpdate: {
          surfaceId: 'vega-demo',
          components: [{
            id: 'vega-root',
            component: {
              VegaChart: {
                spec: {
                  '$schema': 'https://vega.github.io/schema/vega-lite/v5.json',
                  'description': 'A simple bar chart with embedded data.',
                  'data': {
                    'values': [
                      {'category': 'A', 'amount': 28},
                      {'category': 'B', 'amount': 55},
                      {'category': 'C', 'amount': 43},
                      {'category': 'D', 'amount': 91},
                      {'category': 'E', 'amount': 81},
                      {'category': 'F', 'amount': 53},
                      {'category': 'G', 'amount': 19},
                      {'category': 'H', 'amount': 87}
                    ]
                  },
                  'mark': 'bar',
                  'encoding': {
                    'x': {
                      'field': 'category',
                      'type': 'nominal',
                      'axis': {'labelAngle': 0}
                    },
                    'y': {'field': 'amount', 'type': 'quantitative'}
                  }
                },
                height: 300
              }
            }
          }]
        }
      },
      {beginRendering: {surfaceId: 'vega-demo', root: 'vega-root'}}
    ]
  },
  {
    id: 'feature-grid',
    title: 'Feature List',
    description: 'A list of features or items using cards and icons.',
    message: [
      {
        surfaceUpdate: {
          surfaceId: 'feature-list',
          components: [
            {
              id: 'feature-root',
              component: {
                List: {
                  children:
                      {explicitList: ['feature-1', 'feature-2', 'feature-3']},
                  direction: 'horizontal',
                  distribution: 'spaceEvenly'
                }
              }
            },
            {id: 'feature-1', component: {Card: {child: 'f1-col'}}}, {
              id: 'f1-col',
              component: {
                Column: {
                  children: {explicitList: ['f1-icon', 'f1-text']},
                  alignment: 'center'
                }
              }
            },
            {
              id: 'f1-icon',
              component: {Icon: {name: {literalString: 'speed'}}}
            },
            {
              id: 'f1-text',
              component:
                  {Text: {text: {literalString: 'Fast'}, usageHint: 'body'}}
            },
            {id: 'feature-2', component: {Card: {child: 'f2-col'}}}, {
              id: 'f2-col',
              component: {
                Column: {
                  children: {explicitList: ['f2-icon', 'f2-text']},
                  alignment: 'center'
                }
              }
            },
            {
              id: 'f2-icon',
              component: {Icon: {name: {literalString: 'security'}}}
            },
            {
              id: 'f2-text',
              component:
                  {Text: {text: {literalString: 'Secure'}, usageHint: 'body'}}
            },
            {id: 'feature-3', component: {Card: {child: 'f3-col'}}}, {
              id: 'f3-col',
              component: {
                Column: {
                  children: {explicitList: ['f3-icon', 'f3-text']},
                  alignment: 'center'
                }
              }
            },
            {
              id: 'f3-icon',
              component: {Icon: {name: {literalString: 'auto_awesome'}}}
            },
            {
              id: 'f3-text',
              component:
                  {Text: {text: {literalString: 'Smart'}, usageHint: 'body'}}
            }
          ]
        }
      },
      {beginRendering: {surfaceId: 'feature-list', root: 'feature-root'}}
    ]
  },
  {
    id: 'data-grid-demo',
    title: 'Data Grid',
    description: 'A demo of the DataGrid component.',
    message: [
      {
        beginRendering: {
          surfaceId: 'demo-surface',
          root: 'root-container',
        },
      },
      {
        surfaceUpdate: {
          surfaceId: 'demo-surface',
          components: [
            {
              id: 'root-container',
              component: {
                'Column': {
                  children: {
                    explicitList: ['data-grid-demo-comp'],
                  },
                  distribution: 'start',
                  alignment: 'stretch',
                },
              },
            },
            {
              id: 'data-grid-demo-comp',
              component: {
                'DataGrid': {
                  rowData: [
                    {
                      sku: 'APP-001',
                      productName: 'Organic Honeycrisp Apples',
                      qty: 45,
                      date: '2024-03-01'
                    },
                    {
                      sku: 'MIL-001',
                      productName: 'Whole Milk 1gal',
                      qty: 28,
                      date: '2024-03-10'
                    },
                    {
                      sku: 'BRD-001',
                      productName: 'Sourdough Bread Loaf',
                      qty: 15,
                      date: '2024-03-12'
                    },
                    {
                      sku: 'EGG-001',
                      productName: 'Large Brown Eggs 12pk',
                      qty: 52,
                      date: '2024-03-11'
                    },
                    {
                      sku: 'COF-001',
                      productName: 'Dark Roast Coffee Beans',
                      qty: 89,
                      date: '2024-02-28'
                    },
                    {
                      sku: 'TEA-001',
                      productName: 'Earl Grey Tea Bags 20ct',
                      qty: 120,
                      date: '2024-01-15'
                    },
                    {
                      sku: 'CHO-001',
                      productName: '70% Dark Chocolate Bar',
                      qty: 210,
                      date: '2024-03-05'
                    },
                    {
                      sku: 'WAT-001',
                      productName: 'Sparkling Water 6-Pack',
                      qty: 75,
                      date: '2024-03-08'
                    },
                    {
                      sku: 'ORG-001',
                      productName: 'Organic Navel Oranges',
                      qty: 33,
                      date: '2024-03-12'
                    },
                    {
                      sku: 'BAN-001',
                      productName: 'Premium Bananas Bunch',
                      qty: 94,
                      date: '2024-03-11'
                    },
                  ],
                  schema: {
                    fields: [
                      {name: 'sku', type: 'string', displayName: 'SKU'},
                      {
                        name: 'productName',
                        type: 'string',
                        displayName: 'Product Name'
                      },
                      {name: 'qty', type: 'integer', displayName: 'Quantity'},
                      {
                        name: 'date',
                        type: 'string',
                        displayName: 'Last Restocked'
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    ],
  },
  {
    id: 'demo-product-selection-gallery',
    title: 'Product Selection',
    description:
        'A custom component for displaying and selecting products in a tabular format.',
    message: [
      {
        beginRendering:
            {surfaceId: 'product-selection-gallery', root: 'ps-root'}
      },
      {
        surfaceUpdate: {
          surfaceId: 'product-selection-gallery',
          components: [{
            id: 'ps-root',
            component: {
              ProductSelection: {
                productTableTitle: 'Deal Configuration Dashboard',
                confirmLabel: 'Save Changes',
                cancelLabel: 'Reset',
                columns: [
                  {
                    key: 'name',
                    label: 'Product Name',
                    type: 'string',
                    editable: false
                  },
                  {key: 'qty', label: 'Qty', type: 'number', editable: true}, {
                    key: 'discount',
                    label: 'Disc (%)',
                    type: 'decimal',
                    editable: true
                  },
                  {
                    key: 'deliveryDate',
                    label: 'Estimated Delivery',
                    type: 'date',
                    editable: true
                  },
                  {
                    key: 'category',
                    label: 'Category',
                    type: 'picklist',
                    editable: true,
                    options: ['Hardware', 'Software', 'Support']
                  }
                ],
                rows: [
                  {
                    name: 'Laptop Pro 16',
                    qty: 15,
                    discount: 5.5,
                    deliveryDate: '2026-06-15',
                    category: 'Hardware'
                  },
                  {
                    name: 'Ergonomic Chair',
                    qty: 45,
                    discount: 10,
                    deliveryDate: '2026-06-20',
                    category: 'Hardware'
                  },
                  {
                    name: 'Enterprise License',
                    qty: 100,
                    discount: 20,
                    deliveryDate: '2026-07-01',
                    category: 'Software'
                  },
                  {
                    name: '4K Monitor',
                    qty: 30,
                    discount: 0,
                    deliveryDate: '2026-06-25',
                    category: 'Hardware'
                  }
                ]
              }
            }
          }]
        }
      }
    ]
  }
];
