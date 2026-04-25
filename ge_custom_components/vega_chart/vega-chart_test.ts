import 'jasmine';

import {SafeVegaStateProvider} from 'google3/javascript/analysis/data/common/vega/renderer/testing/state';
import {cleanState} from 'google3/testing/web/jasmine/state/clean_state';
import {useState} from 'google3/testing/web/jasmine/state/use_state';
import * as vegaLite from 'vega-lite';

import {transformSpec, VegaChart} from './vega-chart';
import {VegaChartHarness} from './vega-chart_harness';

describe('transformSpec', () => {
  const spec: vegaLite.TopLevelSpec = {
    'data': {
      'values': [
        {'a': 'A', 'b': 28},
        {'a': 'B', 'b': 55},
      ],
    },
    'mark': 'bar',
    'encoding': {
      'x': {'field': 'a', 'type': 'ordinal'},
      'y': {'field': 'b', 'type': 'quantitative'},
    },
  };

  it('sets width and height to container', () => {
    const transformed = transformSpec(spec, 300, 500);
    // tslint:disable-next-line:no-any
    expect((transformed as any).width).toEqual('container');
    // tslint:disable-next-line:no-any
    expect((transformed as any).height).toEqual('container');
  });

  it('sets autosize to fit for non-faceted charts', () => {
    const transformed = transformSpec(spec, 300, 500);
    // tslint:disable-next-line:no-any
    expect((transformed as any).autosize).toEqual({
      type: 'fit',
      contains: 'padding',
    });
  });

  it('sets padding', () => {
    const transformed = transformSpec(spec, 300, 500);
    // tslint:disable-next-line:no-any
    expect((transformed as any).padding).toEqual(10);
  });

  it('removes title', () => {
    const specWithTitle = {...spec, title: 'some title'};
    const transformed = transformSpec(specWithTitle, 300, 500);
    // tslint:disable-next-line:no-any
    expect((transformed as any).title).toBeUndefined();
  });

  it('merges config with defaults', () => {
    const specWithConfig = {
      ...spec,
      config: {view: {stroke: 'black'}, bar: {size: 10}},
    };
    const transformed = transformSpec(specWithConfig, 300, 500);
    // tslint:disable-next-line:no-any
    expect((transformed as any).config?.view?.stroke).toBeNull();
    // tslint:disable-next-line:no-any
    expect((transformed as any).config?.bar?.size).toBeUndefined();
    // tslint:disable-next-line:no-any
    expect((transformed as any).config?.axisX?.grid).toBeFalse();
  });
});

describe('<a2ui-vega-chart>', () => {
  useState(SafeVegaStateProvider);
  const state = cleanState(async () => {
    const element = new VegaChart();
    const harness = new VegaChartHarness(element);
    element.spec = {
      'data': {
        'values': [
          {'a': 'A', 'b': 28},
          {'a': 'B', 'b': 55},
        ],
      },
      'mark': 'bar',
      'encoding': {
        'x': {'field': 'a', 'type': 'ordinal'},
        'y': {'field': 'b', 'type': 'quantitative'},
      },
    };

    document.body.appendChild(element);
    await element.updateComplete; // Wait for it to render once.
    return {element, harness};
  }, beforeEach);

  afterEach(() => {
    document.body.removeChild(state.element);
  });

  it('initializes correctly', async () => {
    expect(state.element).toBeInstanceOf(HTMLElement);
    expect(state.element.localName).toBe('a2ui-vega-chart');
  });

  it('sets container height based on height property', async () => {
    expect(state.harness.container.style.height).toBe('290px');
    state.element.height = 400;
    await state.element.updateComplete;
    expect(state.harness.container.style.height).toBe('400px');
  });

  it('sets overflow to hidden for non-faceted chart', () => {
    expect(state.harness.container.style.overflow).toBe('hidden');
  });

  it('sets overflow to auto for faceted chart', async () => {
    state.element.spec = {
      'data': {
        'values': [
          {'a': 'A', 'b': 28, 'c': 'X'},
          {'a': 'B', 'b': 55, 'c': 'Y'},
        ],
      },
      'mark': 'bar',
      'encoding': {
        'column': {'field': 'c', 'type': 'ordinal'},
        'x': {'field': 'a', 'type': 'ordinal'},
        'y': {'field': 'b', 'type': 'quantitative'},
      },
    };
    await state.element.updateComplete;
    expect(state.harness.container.style.overflow).toBe('auto');
  });
});
