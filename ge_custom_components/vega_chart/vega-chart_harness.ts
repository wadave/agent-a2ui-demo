import {VegaChart} from './vega-chart';

/** Test harness for VegaChart. */
export class VegaChartHarness {
  constructor(private readonly element: VegaChart) {}

  get container() {
    return this.element.renderRoot.querySelector<HTMLElement>(
      '.vega-renderer-wrapper',
    )!;
  }
}
