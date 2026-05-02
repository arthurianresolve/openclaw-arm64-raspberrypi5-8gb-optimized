# iOS Agent Guide

Scope: `apps/ios/**`.

## Boundaries

- Do not edit generated Xcode project files or signing assets unless the user
  explicitly asks for that exact change.
- Prefer `project.yml` and documented generation flows over direct `.pbxproj`
  edits.
- Keep signing secrets out of git. Use `LocalSigning.xcconfig` for local
  overrides and leave `LocalSigning.xcconfig.example` generic.
- Before simulator assumptions, check whether a real iOS device is available
  when the task needs device behavior.

## Validation

- Swift-only changes: run the narrowest applicable Swift build or test command.
- Version changes: update `version.json`, run `pnpm ios:version:sync`, and keep
  docs/install guidance aligned.
- Docs-only iOS changes: use `git diff --check` plus the relevant docs check.

## Review

- Treat app entitlements, signing, push notifications, HealthKit, widgets,
  watch targets, and background modes as high-risk surfaces.
- If an agent cannot prove an Xcode or signing change locally, stop with the
  exact missing validation rather than guessing.
