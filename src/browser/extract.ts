import type { Page, CDPSession } from "puppeteer-core";
import { CAPTURED_PROPERTIES, type DomNode, type StyleRecord } from "../model/types.js";

interface CdpNode {
  nodeId: number;
  nodeType: number;
  nodeName: string;
  nodeValue?: string;
  attributes?: string[];
  children?: CdpNode[];
}

function findByNodeId(node: CdpNode, nodeId: number): CdpNode | undefined {
  if (node.nodeId === nodeId) return node;
  for (const child of node.children ?? []) {
    const found = findByNodeId(child, nodeId);
    if (found) return found;
  }
  return undefined;
}

function attrsToRecord(flat: string[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!flat) return out;
  for (let i = 0; i < flat.length; i += 2) out[flat[i]] = flat[i + 1] ?? "";
  return out;
}

/** "margin-top" -> "marginTop", to match CAPTURED_PROPERTIES' camelCase keys. */
function toCamelCase(kebab: string): string {
  return kebab.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Of CAPTURED_PROPERTIES, the ones that are actually CSS-inheritable. CDP's `inherited` entries
 * on CSS.getMatchedStylesForNode report *every* rule that matched the ancestor, not just the
 * inheritable subset (verified directly — an ancestor's `div { display: block }` UA rule shows up
 * there too, even though `display` isn't inherited). So this list has to be applied by us.
 */
const INHERITABLE_PROPERTIES = new Set(["color", "fontSize", "fontWeight", "lineHeight", "textAlign"]);

/**
 * Property names backed by a matched CSS rule — on this node directly, or (for inheritable
 * properties only) inherited from an ancestor's rule. Regardless of origin (author stylesheet vs.
 * browser UA stylesheet): a UA rule like `div { display: block }` is real, meaningful provenance,
 * unlike a property that matches no rule at all and is just sitting at its unset initial/
 * layout-derived value (e.g. `top: auto` on a statically positioned element, or an unset `width`).
 */
async function coveredProperties(client: CDPSession, nodeId: number): Promise<Set<string>> {
  const matched = await client.send("CSS.getMatchedStylesForNode", { nodeId });
  const covered = new Set<string>();

  const addStyleProps = (style: { cssProperties?: { name: string }[] } | undefined, filter?: (name: string) => boolean) => {
    for (const prop of style?.cssProperties ?? []) {
      const name = toCamelCase(prop.name);
      if (!filter || filter(name)) covered.add(name);
    }
  };

  for (const match of matched.matchedCSSRules ?? []) addStyleProps(match.rule.style);
  addStyleProps(matched.inlineStyle);
  for (const ancestor of matched.inherited ?? []) {
    const inheritableOnly = (name: string) => INHERITABLE_PROPERTIES.has(name);
    for (const match of ancestor.matchedCSSRules ?? []) addStyleProps(match.rule.style, inheritableOnly);
    addStyleProps(ancestor.inlineStyle, inheritableOnly);
  }

  return covered;
}

async function computedStyleRecord(client: CDPSession, nodeId: number): Promise<Record<string, string>> {
  const { computedStyle } = await client.send("CSS.getComputedStyleForNode", { nodeId });
  const out: Record<string, string> = {};
  for (const { name, value } of computedStyle) out[toCamelCase(name)] = value;
  return out;
}

async function walk(client: CDPSession, node: CdpNode, path: number[]): Promise<DomNode> {
  const id = path.join(".");

  const [covered, computed] = await Promise.all([
    coveredProperties(client, node.nodeId),
    computedStyleRecord(client, node.nodeId),
  ]);

  const style: StyleRecord = {};
  for (const prop of CAPTURED_PROPERTIES) {
    if (!covered.has(prop)) continue;
    const value = computed[prop];
    if (value) style[prop] = value;
  }

  const attributes = attrsToRecord(node.attributes);
  const children: DomNode[] = [];
  let index = 0;
  for (const child of node.children ?? []) {
    if (child.nodeType === 1) {
      children.push(await walk(client, child, [...path, index]));
      index++;
    } else if (child.nodeType === 3) {
      const text = (child.nodeValue ?? "").trim();
      if (text.length > 0) {
        children.push({ id: [...path, index].join("."), tag: "#text", attributes: {}, textContent: text, children: [], style: {} });
        index++;
      }
    }
  }

  return { id, tag: node.nodeName.toLowerCase(), attributes, children, style };
}

/**
 * Walks the target node's subtree via CDP's DOM/CSS domains, so each captured property carries
 * real rule provenance rather than a raw getComputedStyle() dump — see coveredProperties().
 */
export async function extractTree(page: Page, selector: string): Promise<DomNode> {
  const client = await page.target().createCDPSession();
  await client.send("DOM.enable");
  await client.send("CSS.enable");

  try {
    // depth: -1 eagerly discovers every descendant nodeId up front — DOM.describeNode alone
    // doesn't reliably register nodeIds for later CSS domain calls on those nodes.
    const { root } = await client.send("DOM.getDocument", { depth: -1, pierce: false });
    const { nodeId } = await client.send("DOM.querySelector", { nodeId: root.nodeId, selector });
    if (!nodeId) throw new Error(`No element matched selector: ${selector}`);

    const targetNode = findByNodeId(root as CdpNode, nodeId);
    if (!targetNode) throw new Error(`Matched node not found in discovered document tree for selector: ${selector}`);

    return await walk(client, targetNode, [0]);
  } finally {
    await client.detach();
  }
}
