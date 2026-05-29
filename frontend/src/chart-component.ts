/**
 * A2UI v0.8 Chart and Canvas components, rendered with Chart.js.
 */

import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { createRef, ref, type Ref } from "lit/directives/ref.js";
import { componentRegistry } from "@a2ui/lit/ui";
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

const PALETTE = [
  "#4285f4", "#ea4335", "#fbbc04", "#34a853",
  "#a142f4", "#ff6d01", "#46bdc6", "#ab47bc",
  "#7cb342", "#fb8c00", "#5e35b1", "#26a69a",
];

@customElement("a2ui-restaurant-chart")
export class A2uiChart extends LitElement {
  @property({ type: String }) accessor type: "doughnut" | "pie" | "bar" = "doughnut";
  @property({ type: String }) accessor title = "";
  @property({ type: Array }) accessor chartData: any[] = [];

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

  #canvasRef: Ref<HTMLCanvasElement> = createRef();
  #chart: Chart | null = null;
  #lastSignature = "";

  override render() {
    const items = Array.isArray(this.chartData) ? this.chartData : [];
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
    const canvas = this.#canvasRef.value;
    if (!canvas) return;

    const items = Array.isArray(this.chartData) ? this.chartData : [];
    if (items.length === 0) {
      this.#destroyChart();
      return;
    }

    const sig = JSON.stringify({ type: this.type, title: this.title, items });
    if (sig === this.#lastSignature && this.#chart) return;
    this.#lastSignature = sig;

    this.#destroyChart();

    const labels = items.map((d) => d.label);
    const values = items.map((d) => d.value);
    const colors = items.map((_, i) => PALETTE[i % PALETTE.length]);

    const config: ChartConfiguration =
      this.type === "bar"
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
                title: this.title ? { display: true, text: this.title } : { display: false },
                tooltip: { enabled: true },
              },
              scales: {
                x: { grid: { display: false } },
                y: { beginAtZero: true },
              },
            },
          }
        : {
            type: this.type,
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
                title: this.title ? { display: true, text: this.title } : { display: false },
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

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------
@customElement("a2ui-restaurant-canvas")
export class A2uiCanvas extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      gap: var(--a2ui-spacing-m, 12px);
    }
  `;

  override render() {
    return html`<slot></slot>`;
  }
}

// Register standard components
componentRegistry.register("Chart", A2uiChart, "a2ui-restaurant-chart");
componentRegistry.register("Canvas", A2uiCanvas, "a2ui-restaurant-canvas");
