# windtailor

windtailor rewrites part of a website's front end. It reads a live webpage. It looks at one DOM node. It turns that node's real, rendered styles into Tailwind CSS classes and matching design tokens.

## What windtailor is for

windtailor is not a full rebuild tool. It is one small, repeatable step. You can run windtailor many times. Each run handles one part of a page. A human developer or an agent can call windtailor from the outside, and combine many runs into a full UI rewrite.

windtailor makes one key assumption: the page already renders correctly in a browser. windtailor reads the computed styles from that render. It does not read your source CSS or your build config.

## How it works

```mermaid
sequenceDiagram
    participant Caller as Developer / Agent
    participant CLI as windtailor CLI
    participant Browser as Browser (via CDP)
    participant FS as Output directory

    Caller->>CLI: windtailor <url> --selector <selector>
    CLI->>Browser: open page, connect over CDP
    Browser-->>CLI: page ready
    CLI->>Browser: walk DOM subtree, read computed styles
    Browser-->>CLI: node tree + computed styles
    CLI->>CLI: collect off-scale spacing/color/font/radius values
    CLI->>CLI: cluster them into new design tokens
    CLI->>CLI: assign Tailwind classes to each node
    CLI->>FS: write report.json
    CLI->>FS: write tailwind.config.tokens.js
    CLI->>FS: write reconciled.html
    FS-->>Caller: output directory
```

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

### Before and after

The fixture's button has hand-picked, off-scale values:

```html
<style>
  #card .cta {
    display: inline-block;
    margin-top: 14px;
    padding: 9px 17px;
    background-color: #111827;
    color: #ffffff;
    border-radius: 33px;
  }
</style>
<div class="cta">Click me</div>
```

windtailor reads the rendered result and rewrites it as Tailwind classes:

```html
<div
  class="inline-block static top-[auto] right-[auto] bottom-[auto] left-[auto] w-14.5547 h-4 mt-3.5 mr-0 mb-0 ml-0 pt-2 pr-4 pb-2 pl-4 text-base font-normal leading-normal text-white text-start bg-gray-900 border-t-0 border-r-0 border-b-0 border-l-0 border-t-white border-r-white border-b-white border-l-white rounded-tl-33 rounded-tr-33 rounded-br-33 rounded-bl-33 opacity-100"
>
  Click me
</div>
```

`9px 17px` padding becomes `pt-2 pr-4 pb-2 pl-4`. `#111827` becomes `bg-gray-900`. The odd `33px` radius becomes `rounded-tl-33`, a new token minted just for that value.

**A known limitation**: windtailor writes a class for every computed property today, not only the ones the page's own CSS declared. That is why the output above also carries classes for untouched defaults, like `top-[auto]` and the zero-width border colors. Telling "declared by page CSS" apart from "browser default" is open work — see the project notes.
