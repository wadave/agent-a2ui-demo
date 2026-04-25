/*
 Copyright 2025 Google LLC

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

      https://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

import {ComponentRegistry, componentRegistry} from '../component-registry.js';

import {DataGrid} from './data_grid/data-grid.js';
import {ProductSelection} from './product_selection/product-selection.js';
import {VegaChart} from './vega_chart/vega-chart.js';
import {WebFrameSrcdoc} from './web_frame/web-frame-srcdoc';
import {WebFrameUrl} from './web_frame/web-frame-url';

export function registerCustomComponents(
    registry: ComponentRegistry = componentRegistry) {
  registry.register('VegaChart', VegaChart, 'a2ui-vega-chart');
  registry.register('DataGrid', DataGrid, 'a2ui-data-grid');
  registry.register('WebFrameSrcdoc', WebFrameSrcdoc, 'a2ui-web-frame-srcdoc');
  registry.register('WebFrameUrl', WebFrameUrl, 'a2ui-web-frame-url');
  registry.register(
      'ProductSelection', ProductSelection, 'a2ui-product-selection');
}
