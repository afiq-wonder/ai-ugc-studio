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

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const falKey = Deno.env.get("FAL_KEY");

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

    async function reserve(provider: string, model: string, estimatedCostUsd: number, durationSeconds: number | null) {
      const { data, error } = await sb.rpc("reserve_generation", {
        p_campaign_id: campaignId,
        p_kind: kind,
        p_duration_seconds: durationSeconds,
        p_provider: provider,
        p_model: model,
        p_estimated_cost_usd: estimatedCostUsd,
      });
      if (error) throw new Error(error.message || "generation_not_allowed");
      return data;
    }

    async function complete(usageId: string | undefined, succeeded: boolean) {
      if (usageId) await sb.rpc("complete_generation", { p_usage_id: usageId, p_succeeded: succeeded });
    }

    // Reuse the same proven FLUX.2 [dev] generation family and parameters used by KakiTryOn.
    // Generators remain replaceable adapters; KakiUGC only adapts references, prompt and 9:16 output.
    async function generateWithFal() {
      if (!falKey) throw new Error("fal_key_missing");

      const usableRefs = references.filter((ref) => Boolean(ref?.data));
      const hasRefs = usableRefs.length > 0;
      const model = hasRefs ? "fal-ai/flux-2/edit" : "fal-ai/flux-2";
      const estimatedCostUsd = 0.012 * (hasRefs ? Math.min(usableRefs.length, 3) + 1 : 1);
      const reservation = await reserve("fal", model, estimatedCostUsd, null);
      const usageId = reservation?.id;

      try {
        const payload: Record<string, unknown> = {
          prompt,
          // Exact 9:16 custom output; FLUX.2 accepts custom dimensions from 512–2048 px.
          image_size: { width: 720, height: 1280 },
          num_images: 1,
          guidance_scale: 2.5,
          num_inference_steps: 28,
          acceleration: "regular",
          enable_prompt_expansion: false,
          enable_safety_checker: true,
          output_format: "jpeg",
        };

        if (hasRefs) {
          payload.image_urls = usableRefs.map(
            (ref) => `data:${ref.mimeType || "image/jpeg"};base64,${ref.data}`,
          );
        }

        const response = await fetch(`https://fal.run/${model}`, {
          method: "POST",
          headers: {
            Authorization: `Key ${falKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.detail || data?.error || data?.message || "flux_generation_failed");
        }

        const imageUrl = data?.images?.[0]?.url;
        if (!imageUrl) throw new Error("flux_image_missing");

        let mimeType = data?.images?.[0]?.content_type || "image/jpeg";
        let imageData: string;
        if (String(imageUrl).startsWith("data:")) {
          const [meta, encoded] = String(imageUrl).split(",", 2);
          mimeType = meta.match(/^data:([^;]+)/)?.[1] || mimeType;
          imageData = encoded || "";
        } else {
          const imageResponse = await fetch(imageUrl);
          if (!imageResponse.ok) throw new Error("flux_image_download_failed");
          mimeType = imageResponse.headers.get("content-type") || mimeType;
          imageData = bytesToBase64(new Uint8Array(await imageResponse.arrayBuffer()));
        }
        if (!imageData) throw new Error("flux_image_payload_missing");

        await complete(usageId, true);
        return { kind: "image", provider: "fal", model, mimeType, data: imageData, usageId };
      } catch (error) {
        await complete(usageId, false);
        throw error;
      }
    }

    async function generateImageWithGemini() {
      if (!geminiKey) throw new Error("gemini_key_missing");
      const model = "gemini-3.1-flash-image";
      const reservation = await reserve("google", model, 0.067, null);
      const usageId = reservation?.id;

      try {
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

        await complete(usageId, true);
        return { kind: "image", provider: "google", model, mimeType, data: imageData, usageId };
      } catch (error) {
        await complete(usageId, false);
        throw error;
      }
    }

    if (kind === "image") {
      let falError: unknown = null;
      try {
        return json(await generateWithFal());
      } catch (error) {
        falError = error;
        console.error("FLUX.2 primary failed; escalating to Gemini", error);
      }

      try {
        return json(await generateImageWithGemini());
      } catch (geminiError) {
        console.error("Gemini fallback failed", geminiError);
        const falMessage = falError instanceof Error ? falError.message : "flux_generation_failed";
        const geminiMessage = geminiError instanceof Error ? geminiError.message : "gemini_generation_failed";
        return json({ error: `Primary FLUX failed (${falMessage}). Fallback Gemini failed (${geminiMessage}).` }, 502);
      }
    }

    if (!geminiKey) return json({ error: "gemini_key_missing" }, 500);
    const model = "veo-3.1-lite-generate-preview";
    const reservation = await reserve("google", model, 0.40, 8);
    const usageId = reservation?.id;

    try {
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

      return json({ kind, provider: "google", model, operationName: startPayload.name, usageId, status: "processing" });
    } catch (generationError) {
      await complete(usageId, false);
      throw generationError;
    }
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "internal_error" }, 500);
  }
});
