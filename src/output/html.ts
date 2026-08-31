import type { AssignedClasses, DomNode } from "../model/types.js";

const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
]);

/**
 * The captured tree comes from an arbitrary remote page, and reconciled.html is opened from disk,
 * i.e. on a file:// origin — so anything executable that survives serialization runs with local
 * privileges. These elements (and their subtrees) are dropped wholesale: they either execute
 * script, embed remote content, or rewrite how the rest of the document resolves URLs.
 */
const DROPPED_ELEMENTS = new Set(["script", "iframe", "object", "embed", "base", "link", "meta"]);

/** Attributes whose value is a URL, and so need a scheme check rather than just escaping. */
const URL_ATTRIBUTES = new Set([
  "href", "src", "action", "formaction", "poster", "background", "xlink:href", "data", "cite", "longdesc",
]);

const SAFE_SCHEMES = new Set(["http", "https", "mailto", "tel"]);

/** Deliberately conservative: enough for real markup, narrow enough that no name can break out of the tag. */
const VALID_ATTR_NAME = /^[A-Za-z_:][-A-Za-z0-9_:.]*$/;

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function isEventHandlerAttr(name: string): boolean {
  return /^on/i.test(name);
}

/**
 * Browsers ignore leading whitespace and strip embedded control characters while parsing a URL,
 * so both ` JaVaScRiPt:alert(1)` and `java\tscript:alert(1)` execute. Normalize the same way
 * before testing the scheme, then allow only relative URLs, the benign schemes, and data: URLs
 * that are images.
 */
function isSafeUrlValue(value: string): boolean {
  const normalized = value.replace(/[\s\p{Cc}]/gu, "").toLowerCase();
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(normalized);
  if (!scheme) return true; // relative path, query or fragment — resolves against the file itself
  if (scheme[1] === "data") return normalized.startsWith("data:image/");
  return SAFE_SCHEMES.has(scheme[1]);
}

/** A srcset is a comma-separated candidate list; the URL is the first token of each candidate. */
function isSafeSrcset(value: string): boolean {
  return value.split(",").every((candidate) => {
    const url = candidate.trim().split(/\s+/)[0] ?? "";
    return url.length === 0 || isSafeUrlValue(url);
  });
}

/** Whether an attribute from the scraped page may be copied through (after escaping). */
function keepAttribute(name: string, value: string): boolean {
  if (name === "style" || name === "class") return false; // class is re-emitted from the reconciled classes
  if (!VALID_ATTR_NAME.test(name)) return false;
  if (isEventHandlerAttr(name)) return false;

  const lower = name.toLowerCase();
  if (lower === "srcset" || lower === "imagesrcset") return isSafeSrcset(value);
  if (URL_ATTRIBUTES.has(lower)) return isSafeUrlValue(value);
  return true;
}

function serializeNode(node: DomNode, classes: AssignedClasses): string {
  if (node.tag === "#text") return escapeText(node.textContent ?? "");
  if (DROPPED_ELEMENTS.has(node.tag)) return "";

  const attrParts: string[] = [];
  for (const [name, value] of Object.entries(node.attributes)) {
    if (!keepAttribute(name, value)) continue;
    attrParts.push(`${name}="${escapeAttr(value)}"`);
  }

  const nodeClasses = classes[node.id] ?? [];
  if (nodeClasses.length > 0) attrParts.push(`class="${escapeAttr(nodeClasses.join(" "))}"`);

  const attrs = attrParts.length > 0 ? ` ${attrParts.join(" ")}` : "";

  if (VOID_ELEMENTS.has(node.tag)) return `<${node.tag}${attrs}>`;

  const inner = node.children.map((child) => serializeNode(child, classes)).join("");
  return `<${node.tag}${attrs}>${inner}</${node.tag}>`;
}

/**
 * Re-serializes the captured tree with each node's `class` attribute rewritten to its reconciled
 * Tailwind classes. The input tree is untrusted — it came from a live remote page — so this is a
 * sanitizing serializer, not a faithful one; see SECURITY.md for what it drops and why.
 */
export function renderReconciledHtml(root: DomNode, classes: AssignedClasses): string {
  return serializeNode(root, classes);
}
