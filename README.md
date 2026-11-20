# Image Editor

Edit photos and images in layers in the browser, and keep each member's documents in a private library on your own Cloudflare account.

Inspired by https://photopea.com

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Create a blank document, or open a PNG, JPG, WEBP, GIF, BMP or layered PSD by picking, dropping or pasting it.
- Work in layers: add, duplicate, rename, reorder, hide, merge down, set opacity and blend mode, and lock pixels or position.
- Move, crop, resize, rotate and flip; paint and erase; add editable text; undo and redo every step.
- Apply brightness/contrast, hue/saturation, levels, invert, grayscale, gaussian blur and sharpen with a live preview.
- Save the layered document to your library, and export PNG, JPG or WEBP at any size or a layered PSD.
- Browse, open, rename and delete your own documents; admins can see and delete everyone's.

Left out: accounts and sign-in, which your Gateway handles; selections and masks; layer styles, folders and smart objects; vector tools; AI tools; RAW, PDF, SVG and video formats; actions and scripts; advanced filters, brushes and fonts; templates and cloud storage; offline use and device install.

## Setup

```sh
pnpm install
pnpm dev                 # run it locally behind a local Gateway
pnpm test                # unit tests
pnpm run deploy          # deploy to your Cloudflare account through your Gateway
```

The app needs no secrets or settings. The deploy creates its D1 database and an R2 bucket for the documents; R2 must be enabled on the Cloudflare account once.

The checks in `checks/` run against a packaged release with the oss.new runtime; real deployment is not part of them.

## Limitations

- Undo history lasts for the open session; it is not saved with the document.
- Images and documents are limited to 8000 × 8000 px and 60 MB saved.
- PSD files open as flat pixel layers: groups are flattened into their layers, and text, effects, masks and adjustment layers arrive as pixels or not at all.
- Text uses the browser's sans-serif font, and rotating the canvas moves text layers without turning them.
- Editing happens in the browser's memory, so very large images can be slow on small devices.
