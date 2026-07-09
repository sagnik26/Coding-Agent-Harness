# Project Instructions
 
## Commands
- `pnpm test` runs the test suite
- `pnpm build` builds for production
- `pnpm lint` checks code style
 
## Architecture
- Monorepo, packages live in `packages/`
- Each package has its own `tsconfig.json`
- Shared types in `packages/shared/`

# Project Instructions
- All commits must use the format `feat(scope): message`
- The verification step is `bun test`, not `npm test`
 
## Style
- Functional components, no classes
- Named exports, not default
- Error messages must be user-facing
 
## Lessons learned
- Auth middleware must run before rate limiting
- Don't modify migration files directly, generate new ones