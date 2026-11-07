# Independent thinking expansion

Conductor Rebuild, 2026-11-07. Bounded browser regression; no native app launch or input.

## Reference

The parent supplied a fresh REA capture of Conductor 0.87.6's unchanged extracted renderer, receipt `ev_77309b915d5124ba8ed9943605c26bd5e583d9c7510dcd47312ccf41ab33c5f7`. All five steps completed. Two distinct assistant messages had thinking blocks sharing the first 32 characters. Clicking the first showed only its body; the second stayed collapsed.

[REA reference screenshot](https://api.reasonmachines.com/media/pr-screenshots/590c75fa-d793-4280-be40-8629adc1fbef/c0a31b4df1a50ce984cff23ca7f6f98e/ref.png)

The reference is an extracted-renderer observation with synthetic data, **not native parity**. REA's browser observation did not provide artifact identity. The parent retains the raw REA receipt/seed in attachment `thinking-identity-before-and-rea.tar.gz` (052cec4d-d99c-4971-bf2d-162c86a308e5).

## Failure and fix

Fetched main `c0700e4` had Transcript SHA256 `a7b9f01ebebdbacec2b358bfb1c025522deb570ead98f5d7acf5ee46663b74db`. Thinking expansion was keyed by `text.slice(0, 32)`. Threading the existing display-part key through both direct and summary children isolates each block without changing tool or text behavior. State stays in Transcript's existing map, so summary unmounting does not discard it.

The real Transcript fixture ran on Reason Cloud Chrome before changing Transcript. It failed five checks:

- Shared prefix in distinct messages: first click expected `[true,false]`, got `[true,true]`.
- Exact same text across turns: expected `[true,false]`, got `[true,true]`.
- Different blocks within one message: expected `[true,false]`, got `[true,true]`.
- Open choice after streaming append and completion: expected `[true]`, got `[false]`.
- Ungrouped to grouped transition: expected `[true,false,false]`, got `[true,true,false]`.
- Ordinary tool toggling passed before the change.

[Failed-before browser screenshot](https://api.reasonmachines.com/media/pr-screenshots/8056c511-1e85-40ef-91df-f6f8dfcc230b/be68221f60a8064411b7cbaf19312b89/b1843c6e-e619-44e6-bd9e-c6f1b5abb962.png)

After the fix, all six checks passed in dark and light. Streaming coverage also checks an explicit closed choice after a further streaming cycle; grouping coverage checks summary collapse/reopen, settings changes, return below the grouping threshold, and close/reopen. Ordinary tool expansion and final text remain independent.

[After, dark](https://api.reasonmachines.com/media/pr-screenshots/8056c511-1e85-40ef-91df-f6f8dfcc230b/ae533f3dc557b19b9056ea8d092b37a3/da28821a-1173-4b54-867a-221d5f986576.png)

[After, light](https://api.reasonmachines.com/media/pr-screenshots/8056c511-1e85-40ef-91df-f6f8dfcc230b/d7653a49dde3f13a213af35366224996/d316c2b6-573a-46a4-a855-3ada4b8cb700.png)

## Rerun

Start the repository Vite server on a free port using the supported preview lifecycle. Open `/tools/chat/thinking-identity.html?theme=dark`, then click **Run regression**. The JSON result must have `passed: true` and all six checks passed. Repeat with `theme=light`. **Reset shared prefix** restores the two-block starting state for manual clicks.

The fixture imports the real Transcript and feeds `applyChatEvents(emptyTranscript(...))`, not a mock renderer. For automation in a browser supporting module evaluation:

```js
await import('/tools/chat/thinking-identity.tsx').then(m => m.runRegression());
```

Local checks passed:

```bash
npm run typecheck
node --experimental-strip-types --test src/features/chat/*.test.ts
npm run build
git diff --check
```

The chat tests passed 289/289 with no skips. Production build passed. Browser assertions and screenshots are source-fixture proof; they are not packaged macOS execution, native input, or a claim that the entire app matches Conductor. Package provenance and merged-source retest are reported separately after merge. No extra E2E dispatch was started.
