# Frontend React guidelines

Rules for the web app (frontend/web).

## Stack

React 19, TypeScript, Vite, Zustand. The app is a single SPA used both on the web and as a Telegram mini app. No server components. Every page has a unique URL and works as a direct link; browser history must behave normally. Sign in and sign up are part of the SPA too.

## Folder structure

```
src/
├── app/               # Pages / routes
├── components/
│   ├── ui/            # Generic, reusable UI primitives
│   └── features/      # Feature-specific components
├── hooks/             # Custom hooks
├── lib/               # Utilities, API clients, helpers
├── stores/            # Global state (Zustand)
├── types/             # Shared TypeScript types
└── styles/            # Global CSS
```

Components must not import from app/. Data flows down. Side effects live in hooks.

## Components

Prefer writing our own components over pulling them from @telegram-apps/telegram-ui, so we can customise freely. Reused UI goes into components/ui as separate modules with modifiers (variants) as props. CSS stays BEM for isolation; reuse the existing styles. If two copies of the same component drifted apart (for example two loading styles on one button), unify them into one.

A RootController renders everything at the top level, including tooltips and toasts, so they can appear anywhere on the page and are not tied to the caller element.

## React 19 features to actually use

- use() for reading promises and context.
- useOptimistic for instant UI with real sync behind it.
- useActionState for form state.

useEffect is a last resort, not the tool for data fetching, derived state, or event responses. It is fine for: third-party libraries that imperatively mutate the DOM, WebSocket or EventSource subscriptions with cleanup, syncing to localStorage or sessionStorage, and firing analytics on route change (sparingly).

## State

Global client state lives in Zustand. Simple local state is useState. No code splitting — the app is too small for that.

## TypeScript

Type component props with variants. Use discriminated unions for component state. No any.

## Anti-patterns

- useEffect for data fetching, derived state, or event responses.
- Prop drilling three or more levels.
- React.memo everywhere.
- Manual useMemo / useCallback.
- any in TypeScript.
- Giant components (500+ lines).
- Hidden fallbacks, piles of guards, mocks, or silent recovery flows.
- Reasoning or "why this change is correct" notes in code comments.

## Dependencies

Do not install packages published less than 72 hours ago (security rule). Check the publish date of the exact version before adding it.
