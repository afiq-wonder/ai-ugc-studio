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

type RefImage = { role?: string; mimeType?: string; data?: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) return json({ error: "gemini_key_missing" }, 500);

    const sb = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await sb.auth.getUser();
    if (userError || !userData.user) return json({ error: "authentication_required" }, 401);

    const body = await req.json();
    const kind = body?.kind;
    const campaignId = body?.campaignId;
    const prompt = String(body?.prompt || "").trim();
    const references: RefImage[] = Array.isArray(body?.references) ? body.references.slice(0, 3) : [];
    const firstFrame = body?.firstFrame && body.firstFrame.data ? body.firstFrame : null;

    if (!campaignId || !prompt || !["image", "video"].includes(kind)) {
      return json({ error: "invalid_request" }, 400);
    }

    const durationSeconds = kind === "video" ? 8 : 0;
    const provider = "google";
    const model = kind === "image" ? "gemini-3.1-flash-image" : "veo-3.1-generate-preview";

    const { data: reservation, error: reserveError } = await sb.rpc("reserve_generation", {
      p_campaign_id: campaignId,
      p_kind: kind,
      p_duration_seconds: durationSeconds,
      p_provider: provider,
      p_model: model,
      p_estimated_cost_usd: kind === "image" ? 0.067 : 0.40,
    });
    if (reserveError) return json({ error: reserveError.message || "generation_not_allowed" }, 403);

    const usageId = reservation?.id;

    try {
      if (kind === "image") {
        const input: unknown[] = [];
        for (const ref of references) {
          if (!ref?.data) continue;
          if (ref.role) input.push({ type: "text", text: `${String(ref.role).toUpperCase()} REFERENCE follows. Use only for the role described in the campaign prompt.` });
          input.push({ type: "image", mime_type: ref.mimeType || "image/jpeg", data: ref.data });
        }
        input.push({ type: "text", text: prompt });

        const r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
          method: "POST",
          headers: {
            "x-goog-api-key": geminiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            input,
            response_format: {
              type: "image",
              mime_type: "image/jpeg",
              aspect_ratio: "9:16",
              image_size: "1K",
            },
          }),
        });
        const payload = await r.json();
        if (!r.ok) throw new Error(payload?.error?.message || "image_generation_failed");

        let imageData: string | null = payload?.output_image?.data || null;
        let mimeType = payload?.output_image?.mime_type || "image/jpeg";
        if (!imageData && Array.isArray(payload?.steps)) {
          for (const step of payload.steps) {
            for (const block of step?.content || []) {
              if (block?.type === "image" && block?.data) {
                imageData = block.data;
                mimeType = block.mime_type || mimeType;
                break;
              }
            }
            if (imageData) break;
          }
        }
        if (!imageData) throw new Error("image_payload_missing");

        await sb.rpc("complete_generation", { p_usage_id: usageId, p_succeeded: true });
        return json({ kind, model, mimeType, data: imageData, usageId });
      }

      const instance: Record<string, unknown> = { prompt };
      if (firstFrame?.data) {
        instance.image = {
          inlineData: {
            mimeType: firstFrame.mimeType || "image/jpeg",
            data: firstFrame.data,
          },
        };
      } else if (references.length) {
        instance.referenceImages = references.filter((ref) => ref?.data).map((ref) => ({
          image: { inlineData: { mimeType: ref.mimeType || "image/jpeg", data: ref.data } },
          referenceType: "asset",
        }));
      }

      const start = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:predictLongRunning`, {
        method: "POST",
        headers: {
          "x-goog-api-key": geminiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          instances: [instance],
          parameters: {
            numberOfVideos: 1,
            resolution: "720p",
            aspectRatio: "9:16",
            durationSeconds: 8,
          },
        }),
      });
      const startPayload = await start.json();
      if (!start.ok || !startPayload?.name) throw new Error(startPayload?.error?.message || "video_generation_failed");

      return json({ kind, model, operationName: startPayload.name, usageId, status: "processing" });
    } catch (generationError) {
      if (usageId) await sb.rpc("complete_generation", { p_usage_id: usageId, p_succeeded: false });
      throw generationError;
    }
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "internal_error" }, 500);
  }
});
