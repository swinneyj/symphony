# Creator Clone Phase 1 audit

## Existing architecture to preserve

- `personas` is already Symphony's reusable creator-identity row. `video_formulas.persona_id` and `video_batches.persona_id` depend on it, and image scene generation reads its face references and prompt.
- `voices` already stores provider, provider voice ID, cloned status, and a sample URL.
- `media_assets` is the shared private-Blob catalog. `persona_media` already attaches reusable assets to an identity.
- Product import and TikTok Shop identifiers live in `products`; no Creator Profile migration touches that table or its APIs.
- Provider-specific video generation currently lives behind the Video Studio job/worker pipeline. Creator Clone contracts are additive and do not replace it.

## Phase 1 database changes

Migration `migrations/0022_creator_profiles.sql` evolves `personas` rather than creating a second identity table:

| Column | Purpose |
| --- | --- |
| `voice_provider`, `voice_model_id` | Creator-specific cloned-voice binding while retaining legacy `voice_id` |
| `avatar_provider`, `avatar_model_id` | Digital-twin/avatar binding |
| `style_config` | Structured speaking style, personality traits, and custom instructions |
| `consent_status` | `pending`, `authorized`, `revoked`, or `expired` |
| `consent_confirmed_at`, `consent_notes` | Authorization audit context |

Reference photos remain in `face_ref_urls` for compatibility with image generation. Training videos and voice samples use `media_assets` plus `persona_media` roles `training_video` and `voice_sample`. A unique junction index prevents duplicate attachments.

## Phase 1 application changes

- Extend `src/db/schema.ts` with the new columns and typed style configuration.
- Add `src/lib/creator-clone/providers.ts` with `VoiceProvider`, `AvatarProvider`, and `VideoProvider` contracts plus an honest capability catalog for Fish Audio, HeyGen, Argil, Creatify, and local/open-source.
- Extend existing persona CRUD to validate and persist Creator Profile fields.
- Add `/api/creators` compatibility-first aliases while retaining `/api/personas` for existing callers.
- Reuse `/api/media/upload` and persona media attachment routes for training video and voice sample uploads.
- Add a first-class `/creators` screen and navigation item; keep the Video Studio creator selector wired to the existing persona IDs.
- Keep `/video-studio/personas/[id]` as a compatible detail URL and add `/creators/[id]` as the Creator-facing route.

## Explicitly deferred

No provider is represented as production-ready in Phase 1. Provider API authentication, benchmark jobs/results, cost tracking, routing, and final 9:16 assembly belong to later phases.
