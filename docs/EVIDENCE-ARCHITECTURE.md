# AI UGC Studio — Evidence Architecture

Status: LOCKED BASELINE + SPATIAL EXTENSION UNDER VALIDATION
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

## Spatial evidence / scale lock contract

1. Product scale is part of product fidelity, not cosmetic styling.
2. Spatial evidence may come from:
   - printed dimensions visibly present in the reference image;
   - product-to-person/body relationships;
   - product-to-hand, table, floor, chair, bottle, bag, shoe, or other familiar-object relationships;
   - component-to-component proportions.
3. Exact dimensions may be stated only when visibly supported or explicitly provided by the user.
4. Perspective-only estimates must never be promoted into exact measurements.
5. `spatialEvidence` stores observed scale relationships with source and confidence.
6. `scaleLock` contains short generation constraints derived only from medium/high-confidence spatial evidence.
7. `spatialUncertainty` quarantines ambiguous scale relationships.
8. The Creative layer must propagate scale lock into `productAccuracy` and every scene where the product is shown or handled.
9. Generators must be told not to miniaturize, enlarge, compress, stretch, or reinterpret product dimensions merely to fit the composition.
10. Spatial evidence may constrain composition, but it must not create unsupported product claims.

## Validated behavior

Validation Test #2 confirmed:
- creator wardrobe/current appearance separated from identity;
- product observations carry source/confidence;
- visible dimensions can be extracted as image evidence;
- unknown specifications are quarantined as uncertain;
- unsupported marketing claims are prohibited;
- invented commerce CTA behavior is blocked;
- Discovery can fall back to model-only operation when Search grounding is unavailable.

Validation Test #3B confirmed:
- product name and user selling points propagate correctly;
- creative energy can be restored without weakening the evidence layer.

Production E2E blank-claims test confirmed:
- the integrated product uses the enhanced intelligence pipeline;
- product structure is recognized from the reference image;
- missing selling points do not break campaign generation.

Spatial regression test identified a remaining failure mode:
- product structure can remain accurate while real-world product scale drifts during downstream image generation.
- the spatial extension above exists specifically to prevent that failure mode and must be regression-tested before being locked.

## Change control

The factual Evidence Architecture remains locked. Future creative tuning may improve hooks, persuasion, tone and scene direction, but must not weaken the evidence contract above.

The Spatial Evidence / Scale Lock extension is additive and currently under validation. Any change that expands what counts as an advertising fact or weakens scale-source requirements should be treated as an architecture change and revalidated before release.
