/**
 * A2UI v0.9 Chart component, rendered with Chart.js.
 *
 * Mirrors the Chart schema in `app/catalog_schemas/0.9/restaurant_finder_catalog_definition.json`
 * and the rizzcharts sample, with `bar` added beyond rizzcharts' published spec.
 *
 * Schema (resolved by A2uiController from path bindings):
 *   - type:      "doughnut" | "pie" | "bar"
 *   - title?:    string
 *   - chartData: Array<{label: string, value: number, drillDown?: ...}>
 *
 * Rendered into a <canvas> via Chart.js. The Chart instance is destroyed and
 * recreated on data change because Chart.js doesn't deeply diff config.
 */

import { html, css, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import { createRef, ref, type Ref } from "lit/directives/ref.js";
import { z } from "zod";
import {
  A2uiController,
  A2uiLitElement,
  basicCatalog,
  type LitComponentApi,
} from "@a2ui/lit/v0_9";
import {
  Chart,
  ArcElement,
  BarElement,
  BarController,
  DoughnutController,
  PieController,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Title,
  type ChartConfiguration,
} from "chart.js";

// Register only the controllers + elements we use to keep the bundle small.
// Chart.js requires BOTH the controller (per chart type) and the element
// (drawn shape) — registering just the element gives "X is not a registered
// controller." at draw time.
Chart.register(
  BarController,
  PieController,
  DoughnutController,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Title,
);

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const DynamicString = z.union([
  z.string(),
  z.object({ path: z.string() }),
]);

const ChartItem = z.object({
  label: z.string(),
  value: z.number(),
  drillDown: z
    .array(z.object({ label: z.string(), value: z.number() }))
    .optional(),
});

const ChartSchema = z.object({
  type: z.enum(["doughnut", "pie", "bar"]),
  title: DynamicString.optional(),
  chartData: z.union([z.array(ChartItem), z.object({ path: z.string() })]),
});

const ChartApi = {
  name: "Chart",
  schema: ChartSchema,
};

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

// Material-ish hues with good contrast on both light and dark surfaces.
// Loops if the data has more than 12 entries.
const PALETTE = [
  "#4285f4", "#ea4335", "#fbbc04", "#34a853",
  "#a142f4", "#ff6d01", "#46bdc6", "#ab47bc",
  "#7cb342", "#fb8c00", "#5e35b1", "#26a69a",
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

@customElement("a2ui-restaurant-chart")
export class A2uiChart extends A2uiLitElement<typeof ChartApi> {
  static override styles = css`
    :host {
      display: block;
      width: 100%;
    }
    .wrap {
      position: relative;
      width: 100%;
      height: 320px;
    }
    canvas {
      width: 100% !important;
      height: 100% !important;
    }
    .empty {
      padding: 24px;
      text-align: center;
      color: var(--ge-text-muted, #5f6368);
      font-size: 13px;
    }
  `;

  protected createController(): A2uiController<typeof ChartApi> {
    return new A2uiController(this, ChartApi);
  }

  #canvasRef: Ref<HTMLCanvasElement> = createRef();
  #chart: Chart | null = null;
  #lastSignature = "";

  /** Coerce a controller-resolved chartData value to a typed array.
   * The data model can hand us a real array, an object keyed by index,
   * or a Map (depending on path resolution), so we normalize all three.
   */
  #toItems(val: unknown): { label: string; value: number }[] {
    if (val == null) return [];
    const extract = (v: unknown): { label: string; value: number } | null => {
      if (v == null) return null;
      const get = (k: string): unknown =>
        v instanceof Map ? v.get(k) : (v as Record<string, unknown>)[k];
      const label = get("label");
      const value = get("value");
      if (label == null || value == null) return null;
      const num = Number(value);
      if (!Number.isFinite(num)) return null;
      return { label: String(label), value: num };
    };
    if (val instanceof Map) {
      return [...val.values()].map(extract).filter((x): x is { label: string; value: number } => x != null);
    }
    if (Array.isArray(val)) {
      return val.map(extract).filter((x): x is { label: string; value: number } => x != null);
    }
    if (typeof val === "object") {
      return Object.values(val).map(extract).filter((x): x is { label: string; value: number } => x != null);
    }
    return [];
  }

  #resolveTitle(t: unknown): string | undefined {
    if (typeof t === "string") return t;
    return undefined;
  }

  override render() {
    const props = this.controller.props;
    if (!props) return nothing;
    const items = this.#toItems(props.chartData);
    if (items.length === 0) {
      return html`<div class="empty">No data to chart yet.</div>`;
    }
    return html`
      <div class="wrap">
        <canvas ${ref(this.#canvasRef)}></canvas>
      </div>
    `;
  }

  override updated() {
    const props = this.controller.props;
    if (!props) return;
    const canvas = this.#canvasRef.value;
    if (!canvas) return;

    const items = this.#toItems(props.chartData);
    if (items.length === 0) {
      this.#destroyChart();
      return;
    }

    const type = props.type;
    const title = this.#resolveTitle(props.title);

    // Cheap signature so we don't tear down + rebuild on every parent re-render.
    const sig = JSON.stringify({ type, title, items });
    if (sig === this.#lastSignature && this.#chart) return;
    this.#lastSignature = sig;

    this.#destroyChart();

    const labels = items.map((d) => d.label);
    const values = items.map((d) => d.value);
    const colors = items.map((_, i) => PALETTE[i % PALETTE.length]);

    const config: ChartConfiguration =
      type === "bar"
        ? {
            type: "bar",
            data: {
              labels,
              datasets: [
                {
                  data: values,
                  backgroundColor: colors,
                  borderWidth: 0,
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                title: title ? { display: true, text: title } : { display: false },
                tooltip: { enabled: true },
              },
              scales: {
                x: { grid: { display: false } },
                y: { beginAtZero: true },
              },
            },
          }
        : {
            type, // "pie" | "doughnut"
            data: {
              labels,
              datasets: [
                {
                  data: values,
                  backgroundColor: colors,
                  borderWidth: 1,
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { position: "right" },
                title: title ? { display: true, text: title } : { display: false },
                tooltip: { enabled: true },
              },
            },
          };

    this.#chart = new Chart(canvas, config);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.#destroyChart();
  }

  #destroyChart() {
    if (this.#chart) {
      this.#chart.destroy();
      this.#chart = null;
    }
  }
}

export const A2uiChartComponent: LitComponentApi = {
  ...ChartApi,
  tagName: "a2ui-restaurant-chart",
};

// ---------------------------------------------------------------------------
// Canvas — rizzcharts uses a `Canvas` root around chart surfaces. The bundled
// basic catalog doesn't include it, so the local Lit shell needs a minimal
// implementation. Treat it as a transparent column-like container that just
// renders its declared children.
// ---------------------------------------------------------------------------

const CanvasSchema = z.object({
  children: z.array(z.string()),
});

const CanvasApi = {
  name: "Canvas",
  schema: CanvasSchema,
};

@customElement("a2ui-restaurant-canvas")
export class A2uiCanvas extends A2uiLitElement<typeof CanvasApi> {
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      gap: var(--a2ui-spacing-m, 12px);
    }
  `;

  protected createController(): A2uiController<typeof CanvasApi> {
    return new A2uiController(this, CanvasApi);
  }

  override render() {
    // The v0.9 framework does NOT project children via <slot>. Each child
    // ID in props.children must be rendered by calling renderNode(id),
    // which resolves the component from the surface tree and instantiates
    // it. (See basic-catalog Column.js for the reference pattern.)
    const props = this.controller.props;
    if (!props) return nothing;
    const children = Array.isArray(props.children) ? props.children : [];
    return html`${children.map((child) => this.renderNode(child))}`;
  }
}

export const A2uiCanvasComponent: LitComponentApi = {
  ...CanvasApi,
  tagName: "a2ui-restaurant-canvas",
};

// Register on the shared basicCatalog so the v0.9 MessageProcessor can resolve
// `Chart` and `Canvas` surfaces. Same pattern as WebFrameUrl/GoogleMap in
// google-map-component.ts.
basicCatalog.components.set(A2uiChartComponent.name, A2uiChartComponent);
basicCatalog.components.set(A2uiCanvasComponent.name, A2uiCanvasComponent);
