import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await sb.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "authentication_required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const key = Deno.env.get("GEMINI_API_KEY");
    if (!key) return new Response(JSON.stringify({ error: "gemini_key_missing" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { uri } = await req.json();
    const videoUri = String(uri || "");
    if (!videoUri.startsWith("https://generativelanguage.googleapis.com/") && !videoUri.startsWith("https://storage.googleapis.com/")) {
      return new Response(JSON.stringify({ error: "invalid_video_uri" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const upstream = await fetch(videoUri, { headers: { "x-goog-api-key": key }, redirect: "follow" });
    if (!upstream.ok) {
      const text = await upstream.text();
      return new Response(JSON.stringify({ error: text || "video_download_failed" }), { status: upstream.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": upstream.headers.get("content-type") || "video/mp4",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "internal_error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
