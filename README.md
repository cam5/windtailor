# windtailor

windtailor rewrites part of a website's front end. It reads a live webpage. It looks at one DOM node. It turns that node's real, rendered styles into Tailwind CSS classes and matching design tokens.

## What windtailor is for

windtailor is not a full rebuild tool. It is one small, repeatable step. You can run windtailor many times. Each run handles one part of a page. A human developer or an agent can call windtailor from the outside, and combine many runs into a full UI rewrite.

windtailor makes one key assumption: the page already renders correctly in a browser. windtailor reads the computed styles from that render. It does not read your source CSS or your build config.

## Install

```sh
npm install
npm run build
```

This creates the `windtailor` command in `dist/cli.js`.

## Use

```sh
windtailor <url> --selector <css-selector> --out <output-dir>
```

- `<url>` is the page to fetch.
- `--selector` picks one DOM node on that page.
- `--out` sets where windtailor writes its output. The default is `./out`.

windtailor writes three files to the output directory:

- `report.json` — the full record of the node, its computed styles, and the classes windtailor assigned.
- `tailwind.config.tokens.js` — new design tokens for any value that did not fit Tailwind's stock scale.
- `reconciled.html` — the same node, now marked up with Tailwind classes.

## Toy example

This repo ships a small fixture page at `fixtures/simple.html`. It has one card with off-scale spacing and colors, so you can see windtailor's token clustering at work.

Run windtailor against it:

```sh
windtailor "file://$(pwd)/fixtures/simple.html" --selector "#card" --out ./out
```

Open `out/reconciled.html` to see the card rebuilt with Tailwind classes. Open `out/tailwind.config.tokens.js` to see the new spacing and radius tokens windtailor generated for the fixture's off-scale values.
