import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const authHeader = req.headers.get("Authorization") || "";
    const key = Deno.env.get("GEMINI_API_KEY");
    if (!key) return json({ error: "gemini_key_missing" }, 500);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await sb.auth.getUser();
    if (userError || !userData.user) return json({ error: "authentication_required" }, 401);

    const { operationName, usageId } = await req.json();
    const name = String(operationName || "");
    if (!name.startsWith("operations/") || !usageId) return json({ error: "invalid_operation" }, 400);

    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/${name}`, {
      headers: { "x-goog-api-key": key },
    });
    const payload = await r.json();
    if (!r.ok) return json({ error: payload?.error?.message || "video_status_failed" }, r.status);
    if (!payload?.done) return json({ done: false });

    if (payload?.error) {
      await sb.rpc("complete_generation", { p_usage_id: usageId, p_succeeded: false });
      return json({ done: true, error: payload.error?.message || "video_generation_failed" }, 500);
    }

    const video = payload?.response?.generateVideoResponse?.generatedSamples?.[0]?.video ||
      payload?.response?.generatedVideos?.[0]?.video || null;
    if (!video?.uri) {
      await sb.rpc("complete_generation", { p_usage_id: usageId, p_succeeded: false });
      return json({ done: true, error: "video_payload_missing" }, 500);
    }

    const { error: completionError } = await sb.rpc("complete_generation", { p_usage_id: usageId, p_succeeded: true });
    if (completionError) return json({ error: completionError.message }, 500);

    return json({ done: true, video: { uri: video.uri, mimeType: video.mimeType || "video/mp4" } });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "internal_error" }, 500);
  }
});
