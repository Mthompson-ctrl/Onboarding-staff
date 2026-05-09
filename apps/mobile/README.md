# @sentinel/mobile

Capacitor wrap around a Next.js static export. Candidate-only scope.
Shares utilities (validation, formatters, document constants) with
`apps/web` via `@sentinel/shared`.

## Dev workflow

Browser preview of the bundled web layer (run from repo root):

```bash
npm run build -w @sentinel/mobile
python3 -m http.server -d apps/mobile/out 8001
```

Re-sync the Android wrap after a web bundle change:

```bash
npm run build -w @sentinel/mobile
cd apps/mobile && npx cap sync android
```

## iOS — adding the platform on a Mac

iOS scaffolding requires Xcode and CocoaPods (macOS-only). The
Codespace builds the bundle; the iOS shell has to be created on a
Mac. On a Mac with Xcode and CocoaPods installed:

```bash
cd apps/mobile
npm install
npm run build
npx cap add ios
npx cap sync ios
npx cap open ios          # opens the project in Xcode
```

Commit the generated `ios/` tree alongside the existing `android/`
tree. Capacitor's bundled `.gitignore` covers the noisy generated
subset (Pods/, build/, xcuserdata, etc.).

## Environment

Copy `.env.local.example` to `.env.local` and fill in the anon key.
**Never** add a service-role secret here — see the comment in
`.env.local.example` for why.

## See also

- `/CLAUDE.md` — repo overview, tech stack, domain context, schema.
