import './a2ui-surface-container';
import 'google3/third_party/javascript/material/web/icon/icon';

import {css, html, LitElement} from 'lit';
import {customElement, state} from 'lit/decorators';

import {styles as standardComponentsStyles} from './a2ui-standard-components.css';
import {DEMO_ITEMS, GALLERY_MESSAGES} from './component_data';
import {CATEGORY_TREE} from './settings';


/**
 * Showcase for standard A2UI components.
 */
@customElement('a2ui-standard-components')
export class A2uiStandardComponents extends LitElement {
  @state() activeCategory = 'Layout';
  @state() activeItem = 'Row';
  @state() expandedCodeIds = new Set<string>();

  toggleCode(id: string) {
    const newSet = new Set(this.expandedCodeIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    this.expandedCodeIds = newSet;
  }
  static override styles = [standardComponentsStyles];


  scrollToComponent(id: string) {
    const el = this.shadowRoot?.getElementById(id);
    if (el) {
      el.scrollIntoView({behavior: 'smooth', block: 'start'});
    }
  }

  override render() {
    return html`
      <aside class="sidebar">

        <div style="overflow-y: auto;">
          ${
        CATEGORY_TREE.map(
            (cat: any) => html`
            <div>
              <button class="nav-group-btn" @click=${
                () => this.activeCategory = cat.name}>
                ${cat.name}
                <md-icon>${
                this.activeCategory === cat.name ? 'expand_more' :
                                                   'chevron_right'}</md-icon>
              </button>
              ${
                this.activeCategory === cat.name ?
                    html`
                <ul class="nav-list">
                  ${
                        cat.items.map(
                            (item: string) => html`
                    <li>
                      <button class="nav-item-btn ${
                                this.activeItem === item ? 'active' : ''}"
                              @click=${() => {
                              this.activeItem = item;
                              this.scrollToComponent(item);
                            }}>
                        ${item}
                      </button>
                    </li>
                  `)}
                </ul>
              ` :
                    ''}
            </div>
          `)}
        </div>
      </aside>

      <main class="main">
        <h1 class="title">Standard Components</h1>
        <p class="subtitle">Core building blocks for creating dynamic user interfaces.</p>

        ${
        CATEGORY_TREE.map(
            (cat: any) => html`
          <h2 class="category-header">${cat.name}</h2>
          ${cat.items.map((item: string) => {
              const specificDemos = DEMO_ITEMS.filter(
                  d => d.title === item || d.title.startsWith(item + ' '));
              if (specificDemos.length === 0) return html``;

              return html`
            <section class="component-section" id=${item}>
              <div class="section-header">
                <div class="section-title">
                  <h3>${item}</h3>
                </div>
              </div>

              ${specificDemos.map(demo => {
                const demoMessages = GALLERY_MESSAGES.filter((msg: any) => {
                  const sid = msg.beginRendering?.surfaceId ||
                      msg.surfaceUpdate?.surfaceId ||
                      msg.dataModelUpdate?.surfaceId;
                  return sid === demo.id;
                });

                return html`
                  <div class="demo-variant">
                    ${
                    demo.title !== item ?
                        html`<div class="demo-title">${demo.title}</div>` :
                        ''}
                    <p class="demo-desc">${demo.description}</p>
                    <div class="preview-area">
                       ${
                    demoMessages.length > 0 ?
                        html`<a2ui-surface-container .a2UIMessages=${
                            demoMessages}></a2ui-surface-container>` :
                        html`<span>No preview available</span>`}
                    </div>
                    <div class="code-toggle-container">
                      <button class="view-code-btn" @click=${
                    () => this.toggleCode(demo.id)}>
                        <md-icon>code</md-icon>
                        ${
                    this.expandedCodeIds.has(demo.id) ? 'Hide Code' :
                                                        'View Code'}
                      </button>
                    </div>
                    ${
                    this.expandedCodeIds.has(demo.id) ?
                        html`
                      <div class="code-preview">
                        <pre><code>${
                            JSON.stringify(demoMessages, null, 2)}</code></pre>
                      </div>
                    ` :
                        ''}
                  </div>
                `;
              })}
            </section>
          `
            })}
        `)}
      </main>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'a2ui-standard-components': A2uiStandardComponents;
  }
}
