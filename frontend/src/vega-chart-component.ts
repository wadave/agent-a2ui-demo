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
import vegaEmbed from "vega-embed";

const VegaChartSchema = z.object({
  spec: z.record(z.any()),
  height: z.number().optional(),
});

const VegaChartApi = {
  name: "VegaChart",
  schema: VegaChartSchema,
};

@customElement("a2ui-vega-chart")
export class A2uiVegaChart extends A2uiLitElement<typeof VegaChartApi> {
  static override styles = css`
    :host {
      display: block;
      width: 100%;
    }
    .wrap {
      width: 100%;
    }
  `;

  protected createController(): A2uiController<typeof VegaChartApi> {
    return new A2uiController(this, VegaChartApi);
  }

  #wrapRef: Ref<HTMLDivElement> = createRef();
  #view: any = null;
  #lastSignature = "";

  override render() {
    const props = this.controller.props;
    if (!props) return nothing;
    const height = props.height ?? 320;
    return html`
      <div class="wrap" style="height: ${height}px" ${ref(this.#wrapRef)}></div>
    `;
  }

  override updated() {
    const props = this.controller.props;
    if (!props) return;
    const wrap = this.#wrapRef.value;
    if (!wrap) return;

    const spec = props.spec;
    const sig = JSON.stringify(spec);
    if (sig === this.#lastSignature) return;
    this.#lastSignature = sig;

    if (this.#view) {
      this.#view.finalize();
      this.#view = null;
    }

    vegaEmbed(wrap, spec, { actions: false, renderer: "canvas" })
      .then((result) => {
        this.#view = result.view;
      })
      .catch((err) => {
        console.error("Vega embed failed:", err);
      });
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    if (this.#view) {
      this.#view.finalize();
      this.#view = null;
    }
  }
}

export const A2uiVegaChartComponent: LitComponentApi = {
  ...VegaChartApi,
  tagName: "a2ui-vega-chart",
};

basicCatalog.components.set(A2uiVegaChartComponent.name, A2uiVegaChartComponent);
