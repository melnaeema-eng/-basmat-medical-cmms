function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    },
  });
}

function extractOutputText(payload: any): string {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const parts: string[] = [];
  for (const item of payload?.output || []) {
    if (item?.type !== "message") continue;
    for (const c of item?.content || []) {
      if (typeof c?.text === "string") parts.push(c.text);
      if (typeof c?.value === "string") parts.push(c.value);
    }
  }
  return parts.join("\n").trim();
}

function parseJsonText(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```json\s*([\s\S]*?)```/i);
    if (fenced) return JSON.parse(fenced[1]);
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) return JSON.parse(objectMatch[0]);
    throw new Error("OpenAI returned no valid JSON object");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return jsonResponse({ ok: true });

  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || "").trim();

    if (!name) {
      return jsonResponse({ ok: false, stage: "input", error: "Company name required" }, 400);
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return jsonResponse({ ok: false, stage: "secret", error: "OPENAI_API_KEY is not configured" }, 500);
    }

    const prompt = `
Search the live web for the company named: "${name}".

This product is a MEDICAL maintenance CMMS.
We are enriching a Medical Knowledge Library.

Return ONLY one JSON object with these exact fields:
{
  "name_ar": string|null,
  "name_en": string|null,
  "website": string|null,
  "email": string|null,
  "phone": string|null,
  "city": string|null,
  "address": string|null,
  "logo_url": string|null,
  "specialties": string[],
  "manufacturers": string[],
  "source_reference": string|null,
  "confidence": number|null
}

Rules:
- You MUST use web search.
- Prefer the official company website.
- Do not invent registration number or VAT number.
- logo_url must be an official/public company logo URL when confidently found; otherwise null.
- specialties must focus on medical equipment / biomedical / healthcare maintenance if supported.
- manufacturers should contain medical equipment brands the company publicly represents/services only if supported.
- If uncertain, use null or [].
- confidence must be between 0 and 100.
- Return JSON only, with no markdown.
`;

    const openaiRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.5",
        tools: [{ type: "web_search" }],
        tool_choice: "required",
        input: prompt,
      }),
    });

    const rawText = await openaiRes.text();

    if (!openaiRes.ok) {
      return jsonResponse({
        ok: false,
        stage: "openai",
        status: openaiRes.status,
        error: rawText.slice(0, 2000),
      }, 500);
    }

    let payload: any;
    try {
      payload = JSON.parse(rawText);
    } catch {
      return jsonResponse({
        ok: false,
        stage: "openai_parse",
        error: "OpenAI response was not JSON",
        detail: rawText.slice(0, 1200),
      }, 500);
    }

    const outputText = extractOutputText(payload);
    if (!outputText) {
      return jsonResponse({
        ok: false,
        stage: "output",
        error: "OpenAI returned an empty result",
      }, 500);
    }

    const data = parseJsonText(outputText);

    return jsonResponse({
      ok: true,
      ...data,
      lookup_stage: "web_search",
    });
  } catch (e) {
    return jsonResponse({
      ok: false,
      stage: "function",
      error: String((e as any)?.message || e),
    }, 500);
  }
});
