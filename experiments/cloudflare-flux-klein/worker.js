const MODEL = "@cf/black-forest-labs/flux-2-klein-4b";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") {
      return Response.json({ ok: true, experiment: "kakiugc-flux-klein", model: MODEL }, { headers: cors });
    }

    try {
      const incoming = await request.formData();
      const creator = incoming.get("creator");
      const product = incoming.get("product");
      const prompt = incoming.get("prompt");

      if (!(creator instanceof File) || !(product instanceof File) || !prompt) {
        return Response.json({ error: "creator, product and prompt are required" }, { status: 400, headers: cors });
      }

      // FLUX.2 Klein multi-reference inputs must be below 512x512.
      // Keep this spike explicit: resize references client-side before POSTing.
      const form = new FormData();
      form.append("input_image_0", creator);
      form.append("input_image_1", product);
      form.append("prompt", String(prompt));
      form.append("width", "768");
      form.append("height", "1344");

      const serialized = new Response(form);
      const result = await env.AI.run(MODEL, {
        multipart: {
          body: serialized.body,
          contentType: serialized.headers.get("content-type"),
        },
      });

      const base64 = result?.image;
      if (!base64) return Response.json({ error: "No image returned", raw: result }, { status: 502, headers: cors });

      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      return new Response(bytes, {
        headers: { ...cors, "Content-Type": "image/jpeg", "Cache-Control": "no-store" },
      });
    } catch (error) {
      return Response.json({ error: error?.message || String(error) }, { status: 500, headers: cors });
    }
  },
};
