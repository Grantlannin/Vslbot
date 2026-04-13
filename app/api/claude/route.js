export const runtime = "nodejs";
/** Allow long model turns (Hobby caps at 10s; Pro/Enterprise can use more). */
export const maxDuration = 60;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request) {
  console.log("[/api/claude] POST received");

  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    console.log("[/api/claude] ANTHROPIC_API_KEY is missing or empty");
    return Response.json(
      {
        type: "error",
        error: {
          type: "configuration_error",
          message: "ANTHROPIC_API_KEY is not set on the server.",
        },
      },
      { status: 500 },
    );
  }

  console.log(
    "[/api/claude] ANTHROPIC_API_KEY prefix (first 8 chars only):",
    `${key.slice(0, 8)}...`,
  );

  let body;
  try {
    body = await request.json();
  } catch (err) {
    console.error("[/api/claude] Invalid JSON body:", err);
    return Response.json(
      {
        type: "error",
        error: {
          type: "invalid_request_error",
          message: "Invalid JSON body.",
        },
      },
      { status: 400 },
    );
  }

  console.log("[/api/claude] forwarding to Anthropic, model:", body?.model);

  const payload = JSON.stringify(body);

  const systemLen =
    typeof body.system === "string"
      ? body.system.length
      : body.system != null
        ? JSON.stringify(body.system).length
        : 0;

  const messagesSummary = Array.isArray(body.messages)
    ? body.messages.map((m, i) => ({
        index: i,
        role: m?.role,
        contentChars:
          typeof m?.content === "string"
            ? m.content.length
            : m?.content != null
              ? JSON.stringify(m.content).length
              : 0,
      }))
    : { error: "body.messages is not an array", value: body.messages };

  console.log("[/api/claude] Outbound request summary:", {
    model: body?.model,
    max_tokens: body?.max_tokens,
    systemPromptChars: systemLen,
    messages: messagesSummary,
    payloadTotalChars: payload.length,
  });

  console.log(
    "[/api/claude] Outbound raw JSON body (complete string sent to Anthropic):",
    payload,
  );

  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`[/api/claude] Anthropic attempt ${attempt}/${maxAttempts}`);

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: payload,
    });

    const responseHeaders = Object.fromEntries(upstream.headers.entries());
    console.log(
      "[/api/claude] Anthropic response HTTP:",
      upstream.status,
      upstream.statusText,
    );
    console.log(
      "[/api/claude] Anthropic response headers (complete):",
      JSON.stringify(responseHeaders, null, 2),
    );

    const rawText = await upstream.text();
    const status = upstream.status;

    let data;
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch (parseErr) {
      console.error(
        "[/api/claude] Anthropic returned non-JSON. HTTP status:",
        status,
      );
      console.error("[/api/claude] Anthropic raw body (full):", rawText);
      const message = `Anthropic returned non-JSON (HTTP ${status}). First 500 chars: ${rawText.slice(0, 500)}`;
      return Response.json(
        {
          type: "error",
          error: {
            type: "parse_error",
            message,
          },
        },
        { status: status || 502 },
      );
    }

    if (upstream.ok) {
      console.log("[/api/claude] Anthropic OK, HTTP status:", status);
      return Response.json(data, { status });
    }

    console.error(
      "[/api/claude] Anthropic error — HTTP status:",
      status,
      "| full JSON body:",
      JSON.stringify(data, null, 2),
    );

    const overloaded =
      status === 529 ||
      status === 503 ||
      data?.error?.type === "overloaded_error";

    if (!overloaded || attempt === maxAttempts) {
      return Response.json(data, { status });
    }

    const retryAfterSec = parseInt(
      upstream.headers.get("retry-after") || "",
      10,
    );
    const backoffMs = Math.min(8000, 1000 * 2 ** (attempt - 1));
    const delayMs = Number.isFinite(retryAfterSec)
      ? Math.min(15000, Math.max(500, retryAfterSec * 1000))
      : backoffMs;

    console.warn(
      `[/api/claude] Anthropic overloaded (${status}), retry ${attempt + 1}/${maxAttempts} after ${delayMs}ms`,
    );
    await sleep(delayMs);
  }
}
