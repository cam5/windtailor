import type { Page } from "puppeteer-core";
import { CAPTURED_PROPERTIES, type DomNode } from "../model/types.js";

/**
 * Walks the target node's subtree in-page (so we get live computed styles) and serializes it
 * into a plain DomNode tree we can bring back across the CDP boundary.
 */
export async function extractTree(page: Page, selector: string): Promise<DomNode> {
  return page.evaluate(
    (selector: string, capturedProps: readonly string[]) => {
      function buildId(path: number[]): string {
        return path.join(".");
      }

      function walkElement(node: Element, path: number[]): any {
        const computed = window.getComputedStyle(node);
        const style: Record<string, string> = {};
        for (const prop of capturedProps) {
          const value = (computed as unknown as Record<string, string>)[prop];
          if (value) style[prop] = value;
        }

        const attributes: Record<string, string> = {};
        for (const attr of Array.from(node.attributes)) {
          attributes[attr.name] = attr.value;
        }

        const children: any[] = [];
        let index = 0;
        for (const child of Array.from(node.childNodes)) {
          if (child.nodeType === Node.ELEMENT_NODE) {
            children.push(walkElement(child as Element, [...path, index]));
            index++;
          } else if (child.nodeType === Node.TEXT_NODE) {
            const text = (child.textContent ?? "").trim();
            if (text.length > 0) {
              children.push({
                id: buildId([...path, index]),
                tag: "#text",
                attributes: {},
                textContent: text,
                children: [],
                style: {},
              });
              index++;
            }
          }
        }

        return {
          id: buildId(path),
          tag: node.tagName.toLowerCase(),
          attributes,
          children,
          style,
        };
      }

      const root = document.querySelector(selector);
      if (!root) throw new Error(`No element matched selector: ${selector}`);
      return walkElement(root, [0]);
    },
    selector,
    CAPTURED_PROPERTIES,
  );
}
