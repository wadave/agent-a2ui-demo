/**
 * Minimal standalone test - does @a2ui/lit render with a proper theme?
 */
import { SignalWatcher } from "@lit-labs/signals";
import { provide } from "@lit/context";
import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
import * as v0_8 from "@a2ui/lit/0.8";
import * as UI from "@a2ui/lit/ui";

// Force component registration
[UI.Card, UI.Text, UI.Column, UI.Row, UI.Button, UI.MultipleChoice, UI.Surface, UI.Root];

const e = {} as Record<string, boolean>;
const s = {} as Record<string, boolean>;
const theme = {
  elements: {
    a: e, audio: e, body: e, button: e, h1: e, h2: e, h3: e, h4: e,
    h5: e, iframe: e, input: e, p: e, pre: e, textarea: e, video: e,
  },
  components: {
    AudioPlayer: e, Button: e, Card: e, Column: e,
    CheckBox: { container: s, element: s, label: s },
    DateTimeInput: { container: s, element: s, label: s },
    Divider: e,
    Image: { all: s, icon: s, avatar: s, smallFeature: s, mediumFeature: s, largeFeature: s, header: s },
    Icon: e, List: e,
    Modal: { backdrop: s, element: s },
    MultipleChoice: { container: s, element: s, label: s },
    Row: e,
    Slider: { container: s, element: s, label: s },
    Tabs: { container: s, element: s, controls: { all: s, selected: s } },
    Text: { all: s, h1: s, h2: s, h3: s, h4: s, h5: s, caption: s, body: s },
    TextField: { container: s, element: s, label: s },
    Video: e,
  },
  markdown: {
    p: [], h1: [], h2: [], h3: [], h4: [], h5: [],
    ul: [], ol: [], li: [], a: [], strong: [], em: [],
  },
} as v0_8.Types.Theme;

@customElement("test-host")
class TestHost extends SignalWatcher(LitElement) {
  @provide({ context: UI.Context.theme })
  accessor theme = theme;

  processor = v0_8.Data.createSignalA2uiMessageProcessor();

  connectedCallback() {
    super.connectedCallback();

    this.processor.processMessages([
      {
        beginRendering: { surfaceId: "test", root: "root" },
      },
      {
        surfaceUpdate: {
          surfaceId: "test",
          components: [
            { id: "root", component: { Card: { child: "col" } } },
            { id: "col", component: { Column: { children: ["t1"] } } },
            { id: "t1", component: { Text: { text: { literalString: "Hello from A2UI!" }, usageHint: "h1" } } },
          ],
        },
      },
    ] as any);

    console.log("Surfaces:", this.processor.getSurfaces().size);
  }

  render() {
    const surfaces = [...this.processor.getSurfaces()];
    console.log("TestHost render, surfaces:", surfaces.length);
    if (surfaces.length === 0) return html`<p>No surfaces</p>`;

    const [surfaceId, surface] = surfaces[0];
    return html`
      <a2ui-surface
        .surfaceId=${surfaceId}
        .surface=${surface}
        .processor=${this.processor}
      ></a2ui-surface>
    `;
  }
}
