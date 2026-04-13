export const runtime = "nodejs";

export async function POST(request) {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    return Response.json(
      { error: { message: "ANTHROPIC_API_KEY is not set on the server." } },
      { status: 500 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: { message: "Invalid JSON body." } },
      { status: 400 },
    );
  }

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  const data = await upstream.json().catch(() => ({}));
  return Response.json(data, { status: upstream.status });
}
