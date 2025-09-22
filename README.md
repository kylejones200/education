# Education Site

A Hugo static site for education resources, colleges, scholarships, and programs. Uses custom layouts and SCSS (no external Hugo theme).

## Develop

- Preview locally:
  ```bash
  hugo server -D
  ```
- Build production:
  ```bash
  hugo --minify
  ```

## Deploy (GitHub Pages)
- GitHub Actions workflow builds with Hugo and deploys via `actions/deploy-pages@v4`.
- Ensure repository Settings → Pages → Source = GitHub Actions.

## Configuration
- Base URL: set in `hugo.toml` (`baseURL = "https://kylejones200.github.io/education/"`).
- Contact:
  - Simple mailto button: set `[params.contact].email` in `hugo.toml`.
  - Hosted form (no mail client): set `[params.contact].formspree_endpoint` (later if desired).
- Navigation: `[menu.main]` in `hugo.toml`.

## Content
- Home/sections under `content/`
- 404 page at `content/404.md`
- About and contact at `content/about/_index.md`
- Thank-you page at `content/thanks/_index.md`

## Assets
- Favicon at `static/favicon.svg` (wired in `layouts/partials/head/custom.html`).
- Robots at `static/robots.txt`.

## Notes
- Theme: none — site uses `layouts/_default/baseof.html` and custom partials/shortcodes.
- Inline search: Fuse.js is now loaded by the `ask` shortcode, so the widget works anywhere without extra includes.
- No backend required. Optional Unsplash prefetch script at `scripts/prefetch_unsplash.py` (not required at build time).

