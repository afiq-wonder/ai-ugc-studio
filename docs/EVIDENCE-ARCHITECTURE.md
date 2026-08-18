# AI UGC Studio — Evidence Architecture

Status: LOCKED BASELINE
Locked: 2026-08-18
Scope: AI Provider intelligence pipeline

## Principle

Creative freedom must never outrun factual evidence.

The intelligence pipeline is:

Perception -> Evidence -> Discovery -> Creative

## Evidence contract

1. Stable visible creator traits belong to `identityTraits`.
2. Clothing, headwear/hijab, jewellery, makeup, pose, expression and background belong to `currentAppearance` and must not become permanent identity.
3. Product facts may be used as advertising facts only when they are:
   - visibly supported by the product image with medium/high confidence; or
   - explicitly supplied by the user.
4. OCR text, logos and printed dimensions that are legible in the reference image are valid image evidence.
5. Uncertain features must not be presented as facts.
6. Unsupported hidden specifications, certifications, pricing, discounts, reviews, popularity, accessories and capabilities must not be invented.
7. Discovery/Search may improve search intent, vocabulary, captions, spoken keywords, on-screen text and hashtags, but may not create product facts.
8. Platform commerce mechanisms or CTAs must not be invented. Without an explicit user CTA, use a neutral CTA.
9. Provider/search failure must degrade capability rather than break campaign generation.

## Validated behavior

Validation Test #2 confirmed:
- creator wardrobe/current appearance separated from identity;
- product observations carry source/confidence;
- visible dimensions can be extracted as image evidence;
- unknown specifications are quarantined as uncertain;
- unsupported marketing claims are prohibited;
- invented commerce CTA behavior is blocked;
- Discovery can fall back to model-only operation when Search grounding is unavailable.

## Change control

This contract is now a baseline. Future creative tuning may improve hooks, persuasion, tone and scene direction, but must not weaken the evidence contract above.

Any change that expands what counts as an advertising fact should be treated as an architecture change and revalidated against the evidence tests before release.
