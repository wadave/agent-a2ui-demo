# A2UI Demo

This directory contains the Lit-based demonstration and component gallery for A2UI components.

## Running the Demo Local Server

To view the demonstration UI, run the developer web server command below:

```bash
iblaze run //third_party/a2ui/renderers/lit_internal/a2ui_demo:demo
```

This will launch a local `web_dev_server`. Follow the output in your terminal to open it in your browser (usually starting on `localhost`).

## Modifying the Demo Gallery

The standard component gallery entries and messages can be found in `component_data.ts`. The structure defines which UI elements and corresponding A2UI JSON messages to render on the **Standard Components** page.
