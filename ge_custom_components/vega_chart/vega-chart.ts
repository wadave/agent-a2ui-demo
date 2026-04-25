import {embed} from 'google3/javascript/analysis/data/common/vega/renderer/safe_vega';
import {Root} from 'google3/third_party/a2ui/renderers/lit_internal/src/v0_8/ui/root.js';
import {CSSResultGroup, html, LitElement, PropertyValues} from 'lit';
import {customElement, property, query} from 'lit/decorators';
import * as vegaLite from 'vega-lite';

import {styles} from './vega-chart.css';

const MIN_FACET_WIDTH = 200;
const MIN_FACET_HEIGHT = 150;

interface FacetSizeResult {
  size: number;
  isOverflowing: boolean;
}

/**
 * Calculates the size for each facet in a faceted chart.
 * @param facetDef The facet definition from the Vega-Lite spec encoding.
 * @param dataValues The data values from the spec.
 * @param containerSize The size of the container (height or width).
 * @param orientation The orientation of faceting ('vertical' or 'horizontal').
 * @return The calculated size for each facet, or undefined.
 */
function calculateFacetSize(
  facetDef: unknown,
  dataValues: unknown[] | undefined,
  containerSize: number,
  orientation: 'vertical' | 'horizontal',
  measuredPadding?: number,
): FacetSizeResult | undefined {
  const field =
    typeof facetDef === 'object' &&
    facetDef !== null &&
    'field' in facetDef &&
    typeof (facetDef as {field?: unknown}).field === 'string'
      ? (facetDef as {field: string}).field
      : undefined;

  if (field && Array.isArray(dataValues) && dataValues.length > 0) {
    const numFacets = new Set(
      dataValues.map((item) => (item as {[key: string]: unknown})[field]),
    ).size;

    // If there's only one facet, treat it as a non-faceted chart for sizing.
    if (numFacets <= 1) {
      return undefined;
    }

    if (containerSize > 0) {
      // Horizontal facets (columns) need horizontal padding for the shared
      // Y-axis labels/title and any legend on the side. Vertical facets (rows)
      // need vertical padding for the shared X-axis labels/title.

      // The measured padding includes the spacing between facets.
      const PADDING = measuredPadding ?? 0;
      const facetSize = (containerSize - PADDING) / numFacets;
      // Fallback to simple division if calculation is not positive
      const calculatedSize =
        facetSize > 0 ? facetSize : containerSize / numFacets;

      const minSize =
        orientation === 'horizontal' ? MIN_FACET_WIDTH : MIN_FACET_HEIGHT;

      if (calculatedSize < minSize) {
        return {size: minSize, isOverflowing: true};
      }
      return {size: calculatedSize, isOverflowing: false};
    }
  }
  return undefined;
}

/**
 * Transforms a Vega-Lite spec to be responsive to its container size.
 *
 * @param vegaSpec The Vega-Lite spec to transform.
 * @param containerHeight The height of the container in pixels.
 * @param containerWidth The width of the container in pixels.
 * @return The transformed Vega-Lite spec.
 */
export function transformSpec(
  vegaSpec: vegaLite.TopLevelSpec,
  containerHeight: number,
  containerWidth: number,
  measuredPadding?: {horizontal: number; vertical: number} | null,
): vegaLite.TopLevelSpec {
  let height: number | 'container' | undefined = 'container';
  let width: number | 'container' | undefined = 'container';

  // Dynamic height/width for faceted charts.
  // tslint:disable-next-line:no-any
  const enc = (vegaSpec as any).encoding || {};
  // tslint:disable-next-line:no-any
  const facet = (vegaSpec as any).facet || {};
  const dataValues = (vegaSpec?.data as {values?: unknown[]})?.values;

  const facetHeightResult = calculateFacetSize(
    enc.row || facet.row,
    dataValues,
    containerHeight,
    'vertical',
    measuredPadding?.vertical,
  );
  const facetWidthResult = calculateFacetSize(
    enc.column || facet.column,
    dataValues,
    containerWidth,
    'horizontal',
    measuredPadding?.horizontal,
  );

  const facetWidth = facetWidthResult?.size;
  const facetHeight = facetHeightResult?.size;

  if (facetWidth !== undefined || facetHeight !== undefined) {
    width = facetWidth;
    height = facetHeight;

    if (width === undefined) {
      const PADDING = measuredPadding?.horizontal ?? 0;
      const calculatedWidth = containerWidth - PADDING;
      width = calculatedWidth > 0 ? calculatedWidth : containerWidth / 2;
    }
    if (height === undefined) {
      const PADDING = measuredPadding?.vertical ?? 0;
      const calculatedHeight = containerHeight - PADDING;
      height = calculatedHeight > 0 ? calculatedHeight : containerHeight / 2;
    }
  }

  const x = enc.x;

  const isTemporalYearMonth =
    x && x.type === 'temporal' && /month/.test(String(x.timeUnit));
  const userControls =
    x?.axis?.values != null ||
    x?.axis?.tickCount != null ||
    x?.scale?.domain != null ||
    x?.scale?.nice != null;

  // fix for https://github.com/vega/vega-lite/pull/9415
  // this block could be removed if we upgrade to vega-lite 5.21+
  if (isTemporalYearMonth && !userControls) {
    // tslint:disable-next-line:no-any
    (vegaSpec as any).encoding.x.axis = {
      ...(x.axis || {}),
      tickCount: {interval: 'month', step: 1},
    };
    // tslint:disable-next-line:no-any
    (vegaSpec as any).encoding.x.scale = {
      ...(x.scale || {}),
      nice: {interval: 'month', step: 1},
    };
  }

  return {
    ...vegaSpec,
    width,
    height,
    autosize: {
      type:
        facetWidth !== undefined || facetHeight !== undefined ? 'pad' : 'fit',
      contains: 'padding',
    },
    title: undefined,
    padding: 10,
    config: {
      // tslint:disable-next-line:no-any
      ...((vegaSpec as any).config || {}),
      axisX: {
        // tslint:disable-next-line:no-any
        ...((vegaSpec as any).config?.axisX || {}),
        grid: false,
        titleFontSize: 14,
        titlePadding: 10,
        labelLimit: 100,
      },
      axisY: {
        // tslint:disable-next-line:no-any
        ...((vegaSpec as any).config?.axisY || {}),
        titleFontSize: 14,
        titlePadding: 10,
      },
      view: {
        // tslint:disable-next-line:no-any
        ...((vegaSpec as any).config?.view || {}),
        stroke: null,
      },
      bar: {
        // tslint:disable-next-line:no-any
        ...((vegaSpec as any).config?.bar || {}),
        size: undefined,
      },
      legend: {
        // tslint:disable-next-line:no-any
        ...((vegaSpec as any).config?.legend || {}),
        labelFontSize: 14,
        titleFontSize: 14,
      },
    },
  };
}

/**
 * A Vega chart component implemented with Lit.
 */
@customElement('a2ui-vega-chart')
export class VegaChart extends Root {
  static override styles = [
    ...Root.styles,  // Inherit base styles
    styles,
  ];
  // tslint:disable-next-line:no-any
  @property({type: Object}) spec: any = null;
  @property({type: Number}) height = 290;

  @query('.vega-renderer-wrapper') container!: HTMLElement;

  // A unique ID for this component instance
  readonly componentId: string;
  private isDestroyed = false;
  private animationFrameRequestId: number|null = null;
  private lastContainerWidthForResize: number | null = null;

  private resizeObserver: ResizeObserver | null = null;
  private hasValidDimensions = false;
  private hasRendered = false;

  private get isFaceted(): boolean {
    return !!(this.spec?.encoding?.row || this.spec?.encoding?.column);
  }

  private getNumFacets(orientation: 'row' | 'column'): number {
    if (!this.spec) return 1;
    const enc = this.spec.encoding || {};
    const facetDef = enc[orientation];
    const field = facetDef?.field;
    // tslint:disable-next-line:no-any
    const dataValues = (this.spec?.data as {values?: any[]})?.values;

    if (field && Array.isArray(dataValues) && dataValues.length > 0) {
      // tslint:disable-next-line:no-any
      return new Set(dataValues.map((item: any) => item[field])).size;
    }
    return 1;
  }

  constructor() {
    super();
    this.componentId = `vega-chart-${Math.random().toString(36).substring(2, 11)}`;
  }

  override connectedCallback() {
    super.connectedCallback();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.isDestroyed = true;
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.animationFrameRequestId !== null) {
      cancelAnimationFrame(this.animationFrameRequestId);
    }
  }

  override firstUpdated() {
    if (this.container) {
      this.container.style.height = `${this.height}px`;
      this.updateOverflowForFaceted();

      this.resizeObserver = new ResizeObserver(() => {
        this.hasValidDimensions = this.isContainerNonZero();
        if (this.hasValidDimensions) {
          const currentWidth = this.container.clientWidth;
          const widthChanged =
            currentWidth !== this.lastContainerWidthForResize;

          if (!this.hasRendered || (this.isFaceted && widthChanged)) {
            this.lastContainerWidthForResize = currentWidth;
            this.scheduleRender();
          }
        }
      });
      this.resizeObserver.observe(this.container);
    }
  }

  override updated(changedProperties: PropertyValues) {
    if (changedProperties.has('height') && this.container) {
      this.container.style.height = `${this.height}px`;
      if (this.isFaceted) {
        this.scheduleRender();
      }
    }

    if (changedProperties.has('spec')) {
      this.hasRendered = false;
      if (this.container) {
        this.updateOverflowForFaceted();
      }
      this.scheduleRender();
    }
  }

  private updateOverflowForFaceted() {
    if (this.isFaceted) {
      this.container.style.overflow = 'auto';
    } else {
      this.container.style.overflow = 'hidden';
    }
  }

  private scheduleRender(): void {
    if (!this.hasValidDimensions || !this.spec) {
      return;
    }

    if (this.animationFrameRequestId !== null) {
      cancelAnimationFrame(this.animationFrameRequestId);
    }
    this.animationFrameRequestId = requestAnimationFrame(async () => {
      this.animationFrameRequestId = null;
      if (this.isDestroyed) return;
      await this.renderChart();
    });
  }

  private async renderChart(): Promise<boolean> {
    try {
      const containerWidth = this.container.clientWidth;
      const containerHeight = this.height;

      let totalWidthForIframe: number | undefined;
      let totalHeightForIframe: number | undefined;

      if (this.isFaceted) {
        // tslint:disable-next-line:no-any
        const enc = (this.spec as any).encoding || {};
        const dataValues = (this.spec?.data as {values?: unknown[]})?.values;

        const facetWidthResult = calculateFacetSize(
            enc.column,
            dataValues,
            containerWidth,
            'horizontal',
            undefined,
        );

        if (facetWidthResult?.isOverflowing) {
          const numCols = this.getNumFacets('column');
          totalWidthForIframe = numCols * facetWidthResult.size;
        }

        const facetHeightResult = calculateFacetSize(
            enc.row,
            dataValues,
            containerHeight,
            'vertical',
            undefined,
        );

        if (facetHeightResult?.isOverflowing) {
          const numRows = this.getNumFacets('row');
          totalHeightForIframe = numRows * facetHeightResult.size;
        }
      }

      await this.renderContent({
        spec: this.spec,
        totalWidth: totalWidthForIframe,
        totalHeight: totalHeightForIframe,
      });
      this.hasRendered = true;
      return true;
    } catch (error) {
      console.error('Error rendering Vega chart:', error);
      return false;
    }
  }

  private async renderContent({
    spec,
    totalWidth,
    totalHeight,
  }: {spec: {}; totalWidth?: number; totalHeight?: number;}) {
    if (!spec) return;

    this.container.textContent = '';

    this.container.style.width = totalWidth ? `${totalWidth}px` : '100%';
    this.container.style.height =
        totalHeight ? `${totalHeight}px` : `${this.height}px`;

    const specForTransform = JSON.parse(JSON.stringify(spec));
    const finalSpec = transformSpec(
        specForTransform as vegaLite.TopLevelSpec,
        this.height,
        this.container.clientWidth,
        null,
    );

    try {
      await embed(this.container, finalSpec);
    } catch (e: unknown) {
      console.error(`UcsVegaChart Error: ${e}`);
    }
  }

  private isContainerNonZero(): boolean {
    if (!this.container) return false;
    const rect = this.container.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  override render() {
    return html` <div class="vega-renderer-wrapper"></div> `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'a2ui-vega-chart': VegaChart;
  }
}
