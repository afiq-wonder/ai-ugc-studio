import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const key = Deno.env.get("GEMINI_API_KEY");
    if (!key) return json({ error: "gemini_key_missing" }, 500);
    const { operationName } = await req.json();
    const name = String(operationName || "");
    if (!name.startsWith("operations/")) return json({ error: "invalid_operation" }, 400);

    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/${name}`, {
      headers: { "x-goog-api-key": key },
    });
    const payload = await r.json();
    if (!r.ok) return json({ error: payload?.error?.message || "video_status_failed" }, r.status);
    if (!payload?.done) return json({ done: false });

    const video = payload?.response?.generateVideoResponse?.generatedSamples?.[0]?.video ||
      payload?.response?.generatedVideos?.[0]?.video || null;
    return json({ done: true, video });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "internal_error" }, 500);
  }
});
