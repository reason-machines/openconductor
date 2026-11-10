# OpenConductor app branding

OpenConductor uses the official Reason hexagon/two-eyes artwork. Home retains
its OPENCONDUCTOR pixel wordmark; sign-in and first-run onboarding use the
neutral mark. The compact mark sits beside “Reason” in the bottom-left sidebar
footer, replacing the old dashed FREE plan badge. It no longer appears beside
the title-bar toggle. Traffic lights, toggle, navigation and account avatars
retain their original roles.

## Source provenance

The source files were copied byte-for-byte from the read-only attached
reason-machines/monorepo checkout at
`ae7783193f148a24095dd1556f6b132a151bfb0a`. Exact upstream paths and SHA-256
hashes are pinned in `scripts/app-brand-assets.json`.

- `public/app-brand/reason-mark-mask.svg`: neutral official mark, rendered as
  a CSS alpha mask in `AppMark`, inheriting the surrounding theme's colour.
  `Icons.LogoMark` is an alias, independent of Reason agent presentation.
- `public/favicon.svg`: official adaptive light/dark favicon.
- `src-tauri/icons/reason-app-icon-ink-1024.png`: unmodified official ink PNG.
- `src-tauri/icons/icon.svg`: unmodified official ink SVG for source reference;
  generated desktop icons deliberately use the PNG, not this SVG.

## Regenerate and verify

After `npm ci`, run:

```bash
bash scripts/gen-icons.sh
npm run check:branding
```

The generator runs the repository-pinned Tauri CLI against the official 1024px
PNG, retains the desktop PNG/ICNS/ICO outputs, and copies the 128px PNG to
`public/icon.png`. The adaptive SVG favicon remains untouched.

The check verifies exact source hashes and generated icon content, PNG dimensions,
bundle icon paths, favicon/onboarding references, and preservation of Home's
wordmark. Tauri emits ICNS chunks in non-deterministic order; its fingerprint
sorts complete chunks without changing their bytes, and validates the container
header and chunk lengths. PNG and ICO hashes remain byte-exact.
It runs as part of `npm run build`, including CI. Regeneration must leave the
generated hashes unchanged; an intentional upstream brand refresh requires
reviewing and updating the pinned provenance.

Tauri's existing bundle icon configuration embeds these generated desktop icons
for the app/Dock and default window icon; the native About dialog uses the app's
bundle icon. No duplicate
runtime icon setter is needed. Native built-app before/after screenshots must
verify these surfaces on macOS; cloud builds do not prove their appearance.

This is a requested OpenConductor brand change, not a claim about Conductor's
artwork or behavior. No new reverse-engineered Conductor claim is introduced.

## Footer identity verification (2026-11-08)

The native executor Session `e1e2b6b9-97cc-4ddc-ba9e-533d89eeeb46`
reported fresh REA accessibility evidence from the real Conductor app, PID 95788,
showing “View pricing” and Settings in the footer. Accessibility does not prove
tag or title-bar pixels. REA `observe-native-ui` for CGWindow 82016 was denied
Screen Recording permission. No alternate capture bypass was attempted.
Retained dark/light sidebar captures remain historical reference only.

The branding guard was updated first and failed on the old FREE badge. After
the change it passes and checks for the official 14px Reason mark beside Reason
in the footer, no pre-footer mark, and no FREE/pricing tag. The cloud frontend
build and colour lint pass. These checks do not prove macOS rendering. Actual
main-built native footer/title-bar screenshots and packaging remain with the
sole native executor; this note is not native visual sign-off.
