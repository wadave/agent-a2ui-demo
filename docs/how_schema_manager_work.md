# How `A2uiSchemaManager` Works

## Overview
The `A2uiSchemaManager` acts as the central coordinator for A2UI protocols on the backend. It bridges the gap between static JSON specifications (Catalogs and Examples) and operational runtimes (Agent Execution loops).

---

## Core Responsibilities

### 1. Catalog Merging
It integrates application-specific requirements with system defaults. For example, it resolves your custom maps catalog configuration alongside core layout utilities (`BasicCatalog`).

### 2. Context Injection
It manages reference models dynamically without polluting base instruction buffers unnecessarily:
- **Schemas**: Validated UI object structure maps.
- **Payload examples**: Contextual training logs used dynamically.

---

## Technical Flow Architecture

### Step A: Initialization (`app/agent.py`)
Loaded via `CatalogConfig` hooks during startup phases:
```python
def _build_schema_manager(self, version: str) -> A2uiSchemaManager:
    return A2uiSchemaManager(
        version=version,
        catalogs=[
            CatalogConfig.from_path(
                name="restaurant_finder",
                catalog_path=CATALOG_DEFINITION_JSON,
                examples_path=os.path.join(_APP_DIR, "examples", "restaurant_finder_catalog", version),
            ),
            BasicCatalog.get_config(version=version),
        ],
    )
```

### Step B: Execution Hook (`app/agent_executor.py`)
Extracted on-demand matching external browser capabilities:
```python
a2ui_catalog = schema_manager.get_selected_catalog(client_ui_capabilities=capabilities)
examples = schema_manager.load_examples(a2ui_catalog, validate=True)
```

---

## Example Walkthrough

**Scenario Prompt**: *"Find Mexican restaurants in Downtown LA"*

### Step 1: Handshake Detection (`agent_executor.py`)
When the request enters the server, the application evaluates whether your browser client knows how to parse graphic interfaces (`X-A2A-Extensions` validation).

### Step 2: Schema Manager Engagement
Once validated, the runner calls `RestaurantFinderAgent.get_schema_manager("0.8")`. The manager performs the following checks:
- **Reads Component Specifications**: It checks `restaurant_finder_catalog_definition.json` to ensure widgets like `GoogleMap` and `Text` are valid.
- **Preps LLM Examples**: It grabs the template sequences mapped for restaurant browsing (`restaurant_selection.json`).

### Step 3: Tool Execution
The core LLM receives the parsed intent and fetches data using domain operations:
- Calls `find_restaurants("Mexican restaurants Downtown LA")`.

### Step 4: Output Synthesis & Schema Validation
Instead of dumping raw text, the agent compiles layout components (`Column`, `List`, `Card`). Before pushing them across the network, the Schema Manager validates the response to check against structural corruption (e.g., confirming a `Row` contains correct array bindings).
