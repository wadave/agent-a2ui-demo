/**
 * A2A client for communicating with the restaurant finder agent.
 *
 * Uses `message/stream` (Server-Sent Events) so the UI can render progressive
 * status updates emitted by the agent — the live "thinking" widget, per-step
 * progress bar, and stage narration — before the final artifact arrives.
 */

const A2UI_EXTENSION_V08 = "https://a2ui.org/a2a-extension/a2ui/v0.8";

// MIME type stamped on A2UI data parts by the backend.
const A2UI_MIME_TYPE = "application/json+a2ui";

// A valid A2UI protocol message has exactly one of these keys.
const A2UI_MESSAGE_KEYS = [
  "createSurface",
  "deleteSurface",
  "updateComponents",
  "updateDataModel",
  "beginRendering",
  "surfaceUpdate",
  "dataModelUpdate",
];

// Backend tags thinking-step narration TextParts with this metadata flag.
const PROGRESS_STAGE_META = "a2uiProgressStage";

export interface A2UIMessage {
  [key: string]: unknown;
}

export interface SendOptions {
  /** Called for each working-state status update that carries a tagged
   *  thinking-step (stage) text part. */
  onStage?: (text: string) => void;
  /** Called for A2UI data parts that arrive on working status updates before
   *  the final artifact (live progress widget + live content surfaces). */
  onA2UIMessage?: (messages: A2UIMessage[]) => void;
}

interface JsonRpcResult {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { message?: string; code?: number };
}

export class RestaurantA2UIClient {
  #rpcEndpoint: string | null = null;
  #requestId = 0;
  // A2A `contextId` groups related messages into a single conversation.
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
    this.#rpcEndpoint = baseUrl;
    return this.#rpcEndpoint;
  }

  async send(
    message: string | Record<string, unknown>,
    options: SendOptions = {},
  ): Promise<{
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
      method: "message/stream",
      id: ++this.#requestId,
      params: {
        message: {
          messageId: crypto.randomUUID(),
          contextId: this.#contextId,
          role: "user",
          parts,
          kind: "message",
          metadata: { a2uiProgress: true },
        },
      },
    };

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "X-A2A-Extensions": A2UI_EXTENSION_V08,
      },
      body: JSON.stringify(rpcRequest),
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    }
    if (!resp.body) {
      throw new Error("Streaming response has no body");
    }

    let textContent = "";
    let failureText = "";
    const a2uiMessages: A2UIMessage[] = [];

    for await (const frame of this.#readSse(resp.body)) {
      let envelope: JsonRpcResult;
      try {
        envelope = JSON.parse(frame);
      } catch (err) {
        console.warn("[A2UI] Skipping unparseable SSE frame:", err);
        continue;
      }
      if (envelope.error) {
        throw new Error(
          envelope.error.message || JSON.stringify(envelope.error),
        );
      }
      const ev = envelope.result as Record<string, unknown> | undefined;
      if (!ev || typeof ev !== "object") continue;

      const kind = ev["kind"];

      if (kind === "status-update") {
        const status = ev["status"] as Record<string, unknown> | undefined;
        const state = status?.["state"];
        const msg = status?.["message"] as
          | { parts?: Array<Record<string, unknown>> }
          | undefined;
        if (state === "working" && msg?.parts) {
          if (options.onStage) {
            for (const p of msg.parts) {
              if (
                p["kind"] === "text" &&
                typeof p["text"] === "string"
              ) {
                if (this.#isStagePart(p)) {
                  options.onStage(p["text"]);
                } else {
                  textContent += p["text"] + "\n";
                }
              }
            }
          }
          if (options.onA2UIMessage) {
            const liveMessages = this.#extractA2UIMessages(msg.parts);
            if (liveMessages.length > 0) {
              options.onA2UIMessage(liveMessages);
            }
          }
        }
        if (state === "failed") {
          for (const p of msg?.parts ?? []) {
            if (p["kind"] === "text" && typeof p["text"] === "string") {
              failureText += p["text"];
            }
          }
          if (!failureText) {
            failureText = "The agent failed to complete the request.";
          }
        }
      } else if (kind === "artifact-update") {
        const artifact = ev["artifact"] as
          | { parts?: Array<Record<string, unknown>> }
          | undefined;
        if (artifact?.parts) {
          for (const part of artifact.parts) {
            if (
              part["kind"] === "text" &&
              typeof part["text"] === "string" &&
              !this.#isStagePart(part)
            ) {
              textContent += part["text"] + "\n";
            } else if (part["kind"] === "data") {
              a2uiMessages.push(...this.#extractA2UIMessages([part]));
            }
          }
        }
      } else if (kind === "task" || kind === "message") {
        const status = (ev["status"] as { message?: { parts?: unknown[] } })
          ?.message;
        if (status?.parts) {
          for (const part of status.parts as Array<Record<string, unknown>>) {
            if (
              part["kind"] === "text" &&
              typeof part["text"] === "string" &&
              !this.#isStagePart(part)
            ) {
              textContent += part["text"] + "\n";
            }
          }
        }
        const artifacts = ev["artifacts"] as
          | Array<{ parts?: Array<Record<string, unknown>> }>
          | undefined;
        if (artifacts) {
          for (const artifact of artifacts) {
            if (!artifact.parts) continue;
            for (const part of artifact.parts) {
              if (part["kind"] === "data") {
                a2uiMessages.push(...this.#extractA2UIMessages([part]));
              }
            }
          }
        }
      }
    }

    if (failureText) {
      throw new Error(failureText.trim());
    }

    return { text: textContent.trim(), a2uiMessages };
  }

  #isStagePart(part: Record<string, unknown>): boolean {
    const meta = part["metadata"] as Record<string, unknown> | undefined;
    return Boolean(meta && meta[PROGRESS_STAGE_META]);
  }

  #isA2UIMessage(obj: unknown): obj is A2UIMessage {
    return (
      typeof obj === "object" &&
      obj !== null &&
      A2UI_MESSAGE_KEYS.some((k) => k in (obj as Record<string, unknown>))
    );
  }

  #extractA2UIMessages(parts: Array<Record<string, unknown>>): A2UIMessage[] {
    const messages: A2UIMessage[] = [];
    for (const part of parts) {
      if (part["kind"] !== "data") continue;
      const meta = part["metadata"] as Record<string, unknown> | undefined;
      const mime = meta?.["mimeType"];
      if (typeof mime === "string" && mime !== A2UI_MIME_TYPE) continue;

      let pData = part["data"];
      if (typeof pData === "string") {
        try {
          pData = JSON.parse(pData);
        } catch {
          continue;
        }
      }
      const candidates = Array.isArray(pData) ? pData : [pData];
      for (const c of candidates) {
        if (this.#isA2UIMessage(c)) messages.push(c);
      }
    }
    return messages;
  }

  async *#readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    const SEP = /\r?\n\r?\n/;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        let m: RegExpExecArray | null;
        while ((m = SEP.exec(buf)) !== null) {
          const raw = buf.slice(0, m.index);
          buf = buf.slice(m.index + m[0].length);
          const data = this.#extractSseData(raw);
          if (data) yield data;
        }
      }
      if (buf.trim()) {
        const data = this.#extractSseData(buf);
        if (data) yield data;
      }
    } finally {
      reader.releaseLock();
    }
  }

  #extractSseData(raw: string): string | null {
    const lines: string[] = [];
    for (const line of raw.split(/\r?\n/)) {
      if (line.startsWith("data:")) {
        lines.push(line.slice(5).replace(/^ /, ""));
      }
    }
    return lines.length > 0 ? lines.join("\n") : null;
  }
}
