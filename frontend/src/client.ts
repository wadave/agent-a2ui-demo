/**
 * A2A client for communicating with the restaurant finder agent.
 *
 * Uses A2A JSON-RPC to communicate with the restaurant finder agent. The
 * UI transport is non-blocking `message/send` plus `tasks/get` polling, which
 * matches the agent card's non-streaming capability.
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
const PROGRESS_STEPS_META = "a2uiProgressSteps";
const POLL_INTERVAL_MS = 750;
const POLL_TIMEOUT_MS = 120_000;

export interface A2UIMessage {
  [key: string]: unknown;
}

export interface SendOptions {
  /** Called for each working-state status update that carries a tagged
   *  thinking-step (stage) text part. */
  onStage?: (text: string, progressSteps?: unknown[]) => void;
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
    return this.#sendPolling(message, options);
  }

  async #sendPolling(
    message: string | Record<string, unknown>,
    options: SendOptions = {},
  ): Promise<{
    text: string;
    a2uiMessages: A2UIMessage[];
  }> {
    const endpoint = await this.#getRpcEndpoint();
    const rpcRequest = this.#buildRpcRequest("message/send", message, {
      blocking: false,
      historyLength: 100,
    });
    const envelope = await this.#postJsonRpc(endpoint, rpcRequest);
    const initial = envelope.result as Record<string, unknown> | undefined;
    if (!initial || typeof initial !== "object") {
      throw new Error("Polling request did not return a task.");
    }

    const taskId = typeof initial["id"] === "string" ? initial["id"] : null;
    if (!taskId) {
      return this.#extractResultFromTask(initial);
    }

    const seenProgress = new Set<string>();
    this.#emitTaskProgress(initial, seenProgress, options);

    const startedAt = Date.now();
    let task = initial;
    while (!this.#isTerminalTask(task)) {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        throw new Error("Timed out waiting for agent response.");
      }
      await this.#delay(POLL_INTERVAL_MS);
      task = await this.#getTask(endpoint, taskId);
      this.#emitTaskProgress(task, seenProgress, options);
    }

    const finalState = this.#getTaskState(task);
    if (finalState !== "completed") {
      const failureText = this.#extractFailureText(task);
      throw new Error(
        failureText || `The agent stopped with state: ${finalState || "unknown"}.`,
      );
    }

    this.#emitTaskProgress(task, seenProgress, options);
    return this.#extractResultFromTask(task);
  }

  #buildRpcRequest(
    method: "message/send",
    message: string | Record<string, unknown>,
    configuration?: Record<string, unknown>,
  ) {
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

    return {
      jsonrpc: "2.0",
      method,
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
        ...(configuration ? { configuration } : {}),
      },
    };
  }

  async #postJsonRpc(
    endpoint: string,
    rpcRequest: Record<string, unknown>,
  ): Promise<JsonRpcResult> {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-A2A-Extensions": A2UI_EXTENSION_V08,
      },
      body: JSON.stringify(rpcRequest),
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    }
    const envelope = await resp.json() as JsonRpcResult;
    if (envelope.error) {
      throw new Error(
        envelope.error.message || JSON.stringify(envelope.error),
      );
    }
    return envelope;
  }

  async #getTask(endpoint: string, taskId: string): Promise<Record<string, unknown>> {
    const envelope = await this.#postJsonRpc(endpoint, {
      jsonrpc: "2.0",
      method: "tasks/get",
      id: ++this.#requestId,
      params: { id: taskId, historyLength: 100 },
    });
    const task = envelope.result as Record<string, unknown> | undefined;
    if (!task || typeof task !== "object") {
      throw new Error(`Task ${taskId} was not found.`);
    }
    return task;
  }

  #emitTaskProgress(
    task: Record<string, unknown>,
    seenProgress: Set<string>,
    options: SendOptions,
  ) {
    if (!options.onStage) return;
    for (const message of this.#taskMessages(task)) {
      for (const part of message.parts ?? []) {
        if (
          part["kind"] !== "text" ||
          typeof part["text"] !== "string" ||
          !this.#isStagePart(part)
        ) {
          continue;
        }
        const steps = this.#extractProgressSteps(part);
        const signature = `${part["text"]}\n${JSON.stringify(steps ?? [])}`;
        if (seenProgress.has(signature)) continue;
        seenProgress.add(signature);
        options.onStage(part["text"], steps);
      }
    }
  }

  #extractResultFromTask(task: Record<string, unknown>): {
    text: string;
    a2uiMessages: A2UIMessage[];
  } {
    let textContent = "";
    const a2uiMessages: A2UIMessage[] = [];

    for (const part of this.#taskResultParts(task)) {
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

    if (!textContent) {
      const status = task["status"] as
        | { message?: { parts?: Array<Record<string, unknown>> } }
        | undefined;
      for (const part of status?.message?.parts ?? []) {
        if (
          part["kind"] === "text" &&
          typeof part["text"] === "string" &&
          !this.#isStagePart(part)
        ) {
          textContent += part["text"] + "\n";
        }
      }
    }

    return { text: textContent.trim(), a2uiMessages };
  }

  #taskMessages(task: Record<string, unknown>) {
    const messages: Array<{ parts?: Array<Record<string, unknown>> }> = [];
    const history = task["history"] as Array<{ parts?: Array<Record<string, unknown>> }> | undefined;
    if (Array.isArray(history)) messages.push(...history);
    const status = task["status"] as
      | { message?: { parts?: Array<Record<string, unknown>> } }
      | undefined;
    if (status?.message) messages.push(status.message);
    return messages;
  }

  #taskResultParts(task: Record<string, unknown>) {
    const parts: Array<Record<string, unknown>> = [];
    const artifacts = task["artifacts"] as
      | Array<{ parts?: Array<Record<string, unknown>> }>
      | undefined;
    for (const artifact of artifacts ?? []) {
      if (artifact.parts) parts.push(...artifact.parts);
    }
    return parts;
  }

  #getTaskState(task: Record<string, unknown>) {
    const status = task["status"] as Record<string, unknown> | undefined;
    return typeof status?.["state"] === "string" ? status["state"] : "";
  }

  #isTerminalTask(task: Record<string, unknown>) {
    return [
      "completed",
      "failed",
      "canceled",
      "rejected",
      "auth-required",
      "input-required",
    ].includes(this.#getTaskState(task));
  }

  #extractFailureText(task: Record<string, unknown>) {
    const status = task["status"] as
      | { message?: { parts?: Array<Record<string, unknown>> } }
      | undefined;
    return this.#extractFailureTextFromParts(status?.message?.parts ?? []);
  }

  #extractFailureTextFromParts(parts: Array<Record<string, unknown>>) {
    let failureText = "";
    for (const part of parts) {
      if (part["kind"] === "text" && typeof part["text"] === "string") {
        failureText += part["text"];
      }
    }
    return failureText || "The agent failed to complete the request.";
  }

  #delay(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  #isStagePart(part: Record<string, unknown>): boolean {
    const meta = part["metadata"] as Record<string, unknown> | undefined;
    return Boolean(meta && meta[PROGRESS_STAGE_META]);
  }

  #extractProgressSteps(part: Record<string, unknown>): unknown[] | undefined {
    const meta = part["metadata"] as Record<string, unknown> | undefined;
    const steps = meta?.[PROGRESS_STEPS_META];
    return Array.isArray(steps) ? steps : undefined;
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

}
