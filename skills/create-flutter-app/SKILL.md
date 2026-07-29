---
name: create-flutter-app
description: "Initialize a clean Flutter app or small mobile project. Use when the user asks to create, scaffold, bootstrap, or start a Flutter application. Start with the minimal stack and add i18n, auth, storage, push, analytics, logging, or Sentry only when requested."
compatibility: "Requires a working Flutter SDK."
---

# Create Flutter App

Create a small, runnable, business-neutral Flutter project.

## Base stack

- Flutter and Dart
- Material 3
- `flutter_bloc` with Cubit
- `go_router`
- `dio`
- Feature-first directories
- Environment values through `--dart-define`

Use iOS and Android as the default platforms. Use `com.example` as the temporary organization id when the user has not provided one.

## Optional capabilities

Add only what the project requires:

- Internationalization: Flutter `gen-l10n`
- Login: provider-neutral auth repository and session state
- Local preferences: `shared_preferences`
- Secure credentials: `flutter_secure_storage`
- Database: Drift
- Push: Firebase Messaging
- Analytics: a vendor-neutral interface
- Logging: `dart:developer`
- Error monitoring: Sentry, configured through `SENTRY_DSN`

## Workflow

1. Confirm the target path, project name, organization id, and requested optional capabilities. Infer safe defaults when they are omitted.
2. Run `flutter create` with the selected platforms and organization id.
3. Add the base dependencies and selected optional dependencies.
4. Organize `lib/` into:

```text
app/                 # app, router, theme
core/                # config, network, shared infrastructure
features/home/
  data/              # repositories and data sources
  presentation/      # screens, widgets, cubits
```

5. Build one working vertical slice: `HomeScreen → HomeCubit → HomeRepository`.
6. Keep names, URLs, copy, assets, and examples generic. Keep credentials out of source code.
7. Run `dart format`, `flutter analyze`, and `flutter test`.
8. Report the project path, chosen capabilities, validation result, and any provider setup still required.

Read [architecture-field-note.md](references/architecture-field-note.md) when the user wants the reasoning behind this architecture.

## Completion standard

The app launches, the `/` route works, one Cubit transition has a test, and every installed dependency supports a selected capability.
