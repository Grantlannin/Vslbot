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

export async function callClaude(
  systemPrompt: string,
  userContent: string,
  maxTokens = 4000,
) {
  const response = await anthropicMessages({
    model: "claude-sonnet-4-20250514",
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
  });
  const data = (await response.json()) as {
    error?: { message?: string };
    content?: { type: string; text?: string }[];
  };
  if (!response.ok) throw new Error(data.error?.message ?? response.statusText);
  if (data.error?.message) throw new Error(data.error.message);
  return data.content?.[0]?.type === "text" ? (data.content[0].text ?? "") : "";
}
