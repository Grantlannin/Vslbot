export type AnthropicMessageBody = {
  model: string;
  max_tokens: number;
  system?: string;
  messages: { role: string; content: string }[];
};

export async function anthropicMessages(body: AnthropicMessageBody) {
  return fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

type AnthropicJson = {
  error?: { message?: string; type?: string };
  content?: { type: string; text?: string }[];
};

function extractAnthropicMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const d = data as AnthropicJson;
  if (typeof d.error?.message === "string" && d.error.message.length > 0) {
    return d.error.message;
  }
  return fallback;
}

export async function callClaude(
  systemPrompt: string,
  userContent: string,
  maxTokens = 4000,
) {
  let response: Response;
  try {
    response = await anthropicMessages({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error";
    throw new Error(
      `${msg}. Check your connection, or try again in a moment.`,
    );
  }

  const rawText = await response.text();
  let data: unknown = {};
  if (rawText) {
    try {
      data = JSON.parse(rawText) as unknown;
    } catch {
      throw new Error(
        response.ok
          ? "The server returned an invalid response."
          : `Server error (${response.status}). ${rawText.slice(0, 160)}`,
      );
    }
  }

  if (!response.ok) {
    throw new Error(
      extractAnthropicMessage(
        data,
        `Request failed (${response.status}). Is ANTHROPIC_API_KEY set on Vercel?`,
      ),
    );
  }

  const d = data as AnthropicJson;
  if (d.error?.message) {
    throw new Error(d.error.message);
  }

  const block = d.content?.[0];
  if (block?.type === "text" && typeof block.text === "string") {
    return block.text;
  }

  throw new Error("Unexpected response from the model (no text content).");
}
