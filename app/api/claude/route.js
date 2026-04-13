export const runtime = "nodejs";

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

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

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

  if (!upstream.ok) {
    console.error(
      "[/api/claude] Anthropic error — HTTP status:",
      status,
      "| full JSON body:",
      JSON.stringify(data, null, 2),
    );
    return Response.json(data, { status });
  }

  console.log("[/api/claude] Anthropic OK, HTTP status:", status);
  return Response.json(data, { status });
}
