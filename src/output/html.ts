import type { AssignedClasses, DomNode } from "../model/types.js";

const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
]);

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function serializeNode(node: DomNode, classes: AssignedClasses): string {
  if (node.tag === "#text") return escapeText(node.textContent ?? "");

  const attrParts: string[] = [];
  for (const [name, value] of Object.entries(node.attributes)) {
    if (name === "style" || name === "class") continue;
    attrParts.push(`${name}="${escapeAttr(value)}"`);
  }

  const nodeClasses = classes[node.id] ?? [];
  if (nodeClasses.length > 0) attrParts.push(`class="${escapeAttr(nodeClasses.join(" "))}"`);

  const attrs = attrParts.length > 0 ? ` ${attrParts.join(" ")}` : "";

  if (VOID_ELEMENTS.has(node.tag)) return `<${node.tag}${attrs}>`;

  const inner = node.children.map((child) => serializeNode(child, classes)).join("");
  return `<${node.tag}${attrs}>${inner}</${node.tag}>`;
}

/** Re-serializes the captured tree with each node's `class` attribute rewritten to its reconciled Tailwind classes. */
export function renderReconciledHtml(root: DomNode, classes: AssignedClasses): string {
  return serializeNode(root, classes);
}
