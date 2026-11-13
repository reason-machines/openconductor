# Media-driven onboarding

Conductor Rebuild prepares media-driven first-run onboarding instead of the title placeholder and eight-second wall clock. The original clip generator draws isolated workspaces, agent states, and reviewing a change. These illustrations are not recordings of either app and do not establish raster parity with Conductor.

**Preparation status:** asset generation, all nine regression cases, the adjacent tests, build, and visual checks have not run. The MP4s are not yet generated or bundled. Source preparation is not a ready product change until the clips exist and verification passes. Execution remains with the existing serialized admission request.

## Retained contract

The real Conductor 0.87.6 renderer was recovered through REA lineage `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. The retained renderer has SHA256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde` and 11,600,457 bytes. The complete `Aoa` declaration is retained unchanged in [the existing reference](../onboarding-selected-slide/reference.json), bytes `[10148881, 10151835)`, SHA256 `7b3c5e12a803ddc9ced7fc2d057e7811ea9103252a1ef947983a3d98679bb5b5`.

`Aoa` renders one video keyed by the selected slide ID, with autoplay, mute, inline playback, and preloading. `timeupdate` sets progress to `currentTime / duration * 100`. `loadeddata` resets progress. `ended` and the next-slide key advance, wrap, and reset progress. Clicking the selected slide only sets the same ID, preserving playback and progress. The adjacent recovered `y6e` declaration selects three proprietary MP4 paths. OpenConductor instead uses its own clips.

Compared against fetched main `c79a81086c3a0e5ba81f1a9a53ec63a4f4dde7ba`, `FirstRunOnboarding.tsx` used an 8,000-ms interval and a text-only frame. No original playback timing or video payload is required to implement the recovered event contract. The replacement durations are design choices, not claims about Conductor.

## Asset provenance

[The generator](../../tools/generate-onboarding-media.py) draws every frame from original geometric layouts and synthetic project names. It reads only the repository's OFL-licensed Geist fonts and uses an installed ffmpeg encoder. No Conductor media, screenshots, extracted pixels, audio, network resources, or proprietary payloads enter the generated assets. The generator and generated illustrations are covered by this repository's MIT license. Font provenance remains in [OFL.txt](../../public/fonts/OFL.txt).

Regenerate with:

```bash
python3 tools/generate-onboarding-media.py
```

The generator requests H.264, yuv420p, 1280×720, 24 fps, no audio, and fast-start metadata. Its designed durations are six, seven, and eight seconds. Encoding and filter workers are each limited to two. Each encoder subprocess has a 120-second timeout. Actual format, durations, output bytes, and hashes remain unverified until generation and media inspection run.

## Regression migration

The frozen timer-specific [selected-slide fixture](../../tests/onboarding-selected-slide.test.mjs), SHA256 `d97a25df52563f4925e0ec31fb15c5094d5100d27d897094788a1e48e1370647`, remains byte-for-byte unchanged as historical evidence. Its premise that advancing a synthetic interval advances playback is intentionally superseded. The existing CI onboarding command now runs [the media-event successor](../../tests/onboarding-media.test.mjs) instead. No shared sign-in or persistence fixture changes.

The successor loads the actual component through real React and `react-test-renderer`, retaining the frozen fixture's React and renderer 18.3.1 pins. It preserves the applicable selected-slide, rerender, agent-choice, busy, and keyboard assertions. It checks media-time progress with unequal durations, load reset, keyed element identity, end-event wrap, no advancement during stalls or wall-clock ticks, invalid duration handling, and bundled MP4 paths. A separate cross-slide case keeps visible progress until the new video's `loadeddata` event resets it, as the retained `Aoa` does. Browser decoding and installed WebKit autoplay require separate verification.

The planned identical baseline and candidate regression command is:

```bash
node --test --test-concurrency=1 --test-reporter=tap tests/onboarding-media.test.mjs
```

Only `ONBOARDING_MEDIA_SOURCE_ROOT` differs between runs. Baseline source comes from main `c79a81086c3a0e5ba81f1a9a53ec63a4f4dde7ba`. Both runs use the same successor fixture and candidate assets. The expected baseline failure is the absence of the video element, not a missing dependency or missing asset. The adjacent command retains `tests/onboarding-effects.test.mjs` and `tests/onboarding-strict-effects.test.mjs` unchanged. None of these commands has run for this change.

## Design choices and limits

Model the Domain keeps each clip source in the existing slide registry rather than adding a parallel lookup. Test Behavior, Not Implementation uses observable video elements, progress, selection, and continuation rather than testing an extracted arithmetic helper. Invalid media metadata is ignored and finite progress is clamped at the HTML media boundary. `preload="auto"` uses a valid HTML preload value in place of the reference's `"true"`.

The retained REA semantic-renderer analysis encountered heap exhaustion. This change relies on the full retained byte span, not a new target execution. Original Conductor playback, physical keyboard focus, installed OpenConductor inclusion, and native WebKit rendering remain unverified unless separately recorded. The app, its process, credentials, and frozen reference packets are untouched.
