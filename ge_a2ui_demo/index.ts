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

import './a2ui-gallery';
import './a2ui-standard-components';
import './a2ui-composer';
import 'google3/third_party/javascript/material/web/icon/icon';

import {styles as ucsA2uiStyles} from 'google3/google/cloud/discoveryengine/apps/ucs_widget/standalone/components/ucs_a2ui/ucs-a2ui.css';
import {registerCustomComponents} from 'google3/third_party/a2ui/renderers/lit_internal/src/v0_8/ui/ui';
import {CSSResultGroup, html, LitElement, PropertyValues} from 'lit';
import {customElement, state} from 'lit/decorators';
import {trustedResourceUrl} from 'safevalues';
import {setLinkHrefAndRel} from 'safevalues/dom';

import {styles as siteStyles} from './site.css';
import type {View} from './types';

registerCustomComponents();

const fontUrls = [
  trustedResourceUrl`https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap`,
  trustedResourceUrl`https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200`,
  trustedResourceUrl`https://fonts.googleapis.com/css2?family=Google+Symbols:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200`,
];
for (const url of fontUrls) {
  const link = document.createElement('link');
  setLinkHrefAndRel(link, url, 'stylesheet');
  document.head.appendChild(link);
}

const resetStyle = document.createElement('style');
resetStyle.textContent = `
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
  }
`;
document.head.appendChild(resetStyle);

/**
 * Main element for the A2UI demo application.
 */
@customElement('a2ui-demo')
export class A2uiDemo extends LitElement {
  static override styles: CSSResultGroup = [siteStyles, ucsA2uiStyles];

  @state() view: View = 'gallery';
  @state() isDark = false;
  @state() isSidebarCollapsed = false;

  override willUpdate(changedProperties: PropertyValues) {
    if (changedProperties.has('isDark')) {
      this.dataset['theme'] = this.isDark ? 'dark' : 'light';
    }
  }

  override render() {
    return html`
      <div class="app-container">
        <aside class="sidebar ${this.isSidebarCollapsed ? 'collapsed' : ''}">
          <div class="sidebar-header" style="${
        this.isSidebarCollapsed ?
            'padding-left: 12px; padding-right: 12px; justify-content: center;' :
            ''}">
            <div class="logo-box">
              <md-icon>spark</md-icon>
            </div>
            ${
    !this.isSidebarCollapsed ? html`<div class="logo-text">GE A2UI Demo</div>` :
                               ''}
          </div>
          <nav class="nav-items">
            <button class="nav-btn ${
        this.view ===
        'gallery' ? 'active' :
                    ''}" @click=${() => this.view = 'gallery'} style="${
        this.isSidebarCollapsed ? 'justify-content: center; padding: 12px 0;' :
                                  ''}" title="Gallery">
              <md-icon>grid_view</md-icon>
              ${
    !this.isSidebarCollapsed ? html`<span>Gallery</span>` : ''}
            </button>
            <button class="nav-btn ${
        this.view ===
        'standard' ? 'active' :
                     ''}" @click=${() => this.view = 'standard'} style="${
        this.isSidebarCollapsed ? 'justify-content: center; padding: 12px 0;' :
                                  ''}" title="Standard Catalog">
              <md-icon>extension</md-icon>
              ${
    !this.isSidebarCollapsed ? html`<span>Standard Catalog</span>` : ''}
            </button>
            <button class="nav-btn ${
        this.view ===
        'composer' ? 'active' :
                     ''}" @click=${() => this.view = 'composer'} style="${
        this.isSidebarCollapsed ? 'justify-content: center; padding: 12px 0;' :
                                  ''}" title="Composer">
              <md-icon>auto_fix</md-icon>
              ${
    !this.isSidebarCollapsed ? html`<span>Composer</span>` : ''}
            </button>
          </nav>
          <div style="padding: 16px; border-top: 1px solid var(--n-90);">
            <button class="nav-btn" style="width: 100%; ${
        this.isSidebarCollapsed ?
        'justify-content: center; padding: 12px 0;' :
        ''}" @click=${() => this.isDark = !this.isDark} title="Toggle Theme">
               <md-icon>${
        this.isDark ?
        'light_mode' :
        'dark_mode'}</md-icon>
               ${
    !this.isSidebarCollapsed ?
        html`<span>${this.isDark ? 'Light Mode' : 'Dark Mode'}</span>` :
        ''}
            </button>
          </div>
        </aside>

        <main class="main-content">
          <header class="header">
            <div style="display: flex; align-items: center; gap: 16px;">
              <button class="nav-btn" style="padding: 8px; margin-left: -16px;" @click=${
        () => this.isSidebarCollapsed =
            !this.isSidebarCollapsed} title="Toggle Sidebar">
                <md-icon>menu</md-icon>
              </button>
              <h1 class="title">
                ${
        this.view ===
        'gallery'  ? 'Component Gallery' : this.view ===
        'standard' ? 'Standard Components' : 'A2UI Composer'}
              </h1>
            </div>

          </header>

          <div class="view-container">
            ${
        this.view ===
        'gallery' ? html`<a2ui-gallery></a2ui-gallery>` : ''}
            ${
        this.view ===
        'standard' ?
        html`<a2ui-standard-components></a2ui-standard-components>` :
        ''}
            ${
        this.view ===
        'composer' ? html`<a2ui-composer></a2ui-composer>` : ''}
          </div>
        </main>
      </div>
    `;
  }
}
document.body.appendChild(document.createElement('a2ui-demo'));
