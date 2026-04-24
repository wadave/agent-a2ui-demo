/**
 * A2A client for communicating with the restaurant finder agent.
 * Uses raw fetch. Frontend is served from the same origin as the backend.
 */

const A2UI_EXTENSION_V09 = "https://a2ui.org/a2a-extension/a2ui/v0.9";

export interface A2UIMessage {
  [key: string]: unknown;
}

export class RestaurantA2UIClient {
  #rpcEndpoint: string | null = null;
  #requestId = 0;
  // A2A `contextId` groups related messages into a single conversation
  // server-side. Without it, the agent's `_prepare_session` allocates a
  // fresh InMemorySessionService session per request, so the LLM cannot
  // see prior turns (find_restaurants results, A2UI surfaces, etc.).
  // We generate one per client instance — i.e. once per page load — so
  // every message in this chat threads into the same server session.
  #contextId: string = crypto.randomUUID();

  /** Reset the conversation. The next message starts a fresh server-side session. */
  resetConversation(): void {
    this.#contextId = crypto.randomUUID();
  }

  async #getRpcEndpoint(): Promise<string> {
    if (this.#rpcEndpoint) return this.#rpcEndpoint;

    const baseUrl = window.location.origin;
    const cardUrl = `${baseUrl}/.well-known/agent-card.json`;
    const resp = await fetch(cardUrl);
    if (!resp.ok) {
      throw new Error(`Failed to fetch agent card: ${resp.status}`);
    }
    await resp.json();
    // A2A JSON-RPC endpoint is at the root (same origin)
    this.#rpcEndpoint = baseUrl;
    return this.#rpcEndpoint;
  }

  async send(message: string | Record<string, unknown>): Promise<{
    text: string;
    a2uiMessages: A2UIMessage[];
  }> {
    const endpoint = await this.#getRpcEndpoint();

    let parts: unknown[];
    if (typeof message === "string") {
      parts = [{ kind: "text", text: message }];
    } else {
      parts = [
        {
          kind: "data",
          data: message,
          mimeType: "application/json+a2ui",
        },
      ];
    }

    const rpcRequest = {
      jsonrpc: "2.0",
      method: "message/send",
      id: ++this.#requestId,
      params: {
        message: {
          messageId: crypto.randomUUID(),
          contextId: this.#contextId,
          role: "user",
          parts,
          kind: "message",
        },
      },
    };

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-A2A-Extensions": A2UI_EXTENSION_V09,
      },
      body: JSON.stringify(rpcRequest),
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    }

    const rpcResponse = await resp.json();

    if (rpcResponse.error) {
      throw new Error(rpcResponse.error.message || JSON.stringify(rpcResponse.error));
    }

    const result = rpcResponse.result;
    let textContent = "";
    const a2uiMessages: A2UIMessage[] = [];

    // Extract from status message
    if (result?.status?.message?.parts) {
      for (const part of result.status.message.parts) {
        if (part.kind === "text") {
          textContent += part.text + "\n";
        } else if (part.kind === "data") {
          a2uiMessages.push(part.data as A2UIMessage);
        }
      }
    }

    // Extract from artifacts
    if (result?.artifacts) {
      for (const artifact of result.artifacts) {
        if (artifact.parts) {
          for (const part of artifact.parts) {
            if (part.kind === "text") {
              textContent += part.text + "\n";
            } else if (part.kind === "data") {
              a2uiMessages.push(part.data as A2UIMessage);
            }
          }
        }
      }
    }

    return { text: textContent.trim(), a2uiMessages };
  }
}
