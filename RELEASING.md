# Release Flowso

Use a clean checkout of `main` so local booking experiments and credentials cannot enter the release. Install Node.js 20 or newer, npm, and Bun.

## Publish the skill

The skill is distributed from `skills/flowso/SKILL.md` in this public repository. There is no separate npm publication for the skill. Users install it with:

```sh
npx skills add gokapso/flowso --skill flowso
```

Add `--global` for user-wide installation. To check discovery without installing:

```sh
npx skills add gokapso/flowso --list
```

The skills.sh directory tracks installations automatically; a separate listing submission is not required. See https://skills.sh/docs/faq.

After npm publication, `npx flowso skill install` installs the skill bundled with that npm version through the same interactive installer. Changes to the GitHub skill are available directly from GitHub; updating the bundled skill requires a new npm release.

## Publish npm

For the initial release, the package is `flowso@0.1.0`. Confirm that version is unpublished and that your npm account can publish the name. An npm 404 alone does not reserve or guarantee ownership of a package name.

```sh
bun install --frozen-lockfile
bun run release:check
npm publish --dry-run --ignore-scripts
npm login
npm whoami
npm publish --access public
```

`npm publish` runs `prepublishOnly`, which reruns `release:check`: TypeScript checks, Vue checks, the test suite, build, and installation of an npm tarball in a temporary consumer project. Do not use `--ignore-scripts` for the actual publication. Complete npm's authentication/2FA prompts.

After publication:

```sh
npm view flowso version
npx --yes flowso@0.1.0 help
```

For later releases, choose a new version, update and commit package metadata and lockfile as needed, run the release checks, and push before publishing. Never reuse a published version.

References: https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/ and https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/.
