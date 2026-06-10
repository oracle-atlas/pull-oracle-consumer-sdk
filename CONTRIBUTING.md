# Contributing

## Getting Started

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Install dependencies: `npm install`
4. Make your changes
5. Run checks: `npm run lint && npm run typecheck && npm run test`
6. Commit with [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat: add new feature`
   - `fix: resolve bug`
   - `docs: update documentation`
   - `refactor: restructure code`
   - `test: add tests`
   - `chore: update tooling`
7. Push and open a Pull Request

## Development

```bash
npm install          # Install dependencies
npm run build        # Build ESM + CJS
npm run test         # Run tests
npm run test:watch   # Run tests in watch mode
npm run lint         # Lint code
npm run typecheck    # Type check
npm run format       # Format code
```

## Versioning and Releases

This project uses [Auto](https://intuit.github.io/auto/docs/welcome/getting-started) to manage semantic versioning, changelog generation, GitHub Releases, and npm publishing.

### Pull Request labels

Auto calculates the next version from Pull Request labels. Add one of these labels before merging:

- `major` — breaking changes
- `minor` — backwards-compatible features
- `patch` — backwards-compatible fixes
- `skip-release` — changes that should not publish a release

### Initial repository setup

1. Replace the placeholder repository values in `.autorc`:
   - `REPLACE_WITH_GITHUB_OWNER`
   - `REPLACE_WITH_GITHUB_REPO`
2. Configure GitHub Actions secrets:
   - `NPM_TOKEN` — npm automation token with publish access
   - `GITHUB_TOKEN` is provided by GitHub Actions and is used as `GH_TOKEN`
3. Create or update Auto labels on GitHub:

```bash
GH_TOKEN=YOUR_TOKEN npm run labels:create
```

You can also store `GH_TOKEN` and `NPM_TOKEN` in a local `.env` file for local release checks. `.env` is ignored by git.

### Release commands

```bash
npm run version:check  # Preview the version Auto would calculate
npm run changelog      # Generate/update changelog entries
npm run release        # Run auto shipit
```

Releases are published by `.github/workflows/release.yml` when changes are pushed to `main`.
