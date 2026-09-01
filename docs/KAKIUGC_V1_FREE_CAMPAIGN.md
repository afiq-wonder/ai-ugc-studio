# KakiUGC V1 — Free Campaign Contract

Status: LOCKED
Date: 2026-09-01

## Acquisition flow

1. Customer completes the KakiUGC campaign setup before authentication.
2. Customer taps **Generate**.
3. KakiUGC opens signup/login.
4. After successful authentication, the existing campaign state is preserved and generation continues without requiring the customer to refill the form.
5. Server-side entitlement is checked before any paid generation request is made.

Clicking Generate before authentication must not consume the free entitlement.

## New-account entitlement

Each eligible new account receives exactly:

- 1 complete KakiUGC campaign.
- Full 3-scene Director output: Hook, Demonstration, Result / CTA.
- Copy-ready prompts and production instructions for all scenes.
- CTA and hashtags.
- 1 AI-generated image.
- 1 AI-generated video with a maximum generated duration of 8 seconds.

Prompts remain copyable so customers can use KakiUGC output with compatible external AI tools even after the included generation entitlement has been consumed.

## Product principle

**KakiUGC Director is the intelligence layer. Generation providers are replaceable execution engines.**

Customer-facing model/provider selection is not required for V1. KakiUGC should route generation internally according to quality, task suitability and operating cost.

Target routing philosophy: lowest practical cost that consistently achieves an acceptable result — lowest cost, not zero cost.

Current provider candidates include Nano Banana-class image generation and GPT Image as image routes, with low-cost capable video providers routed independently. Provider/model names and prices are operational configuration, not part of this locked product contract, and may change without changing the customer entitlement.

## Server-side controls

The backend must be authoritative for:

- account eligibility;
- free-campaign consumption;
- image-generation consumption;
- video-generation consumption and duration;
- model/provider routing;
- retry policy;
- abuse/rate limiting;
- paid entitlement and upgrade state.

Do not rely on browser/localStorage flags as the source of truth for free or paid entitlement.

## Upgrade boundary

After the free entitlement is consumed:

- the completed campaign and its outputs remain available;
- its prompts remain copyable;
- another included generation must not be issued under the free entitlement;
- a subsequent paid-generation attempt should enter the KakiUGC upgrade flow.

## Positioning

> Generate here, or take your KakiUGC prompts anywhere.
