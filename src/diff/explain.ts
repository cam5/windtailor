import type { NodeStyleChange, SemanticDiff, StructureChange, TokenChange } from "./types.js";

function structureLine(change: StructureChange): string {
  switch (change.kind) {
    case "added":
      return `  + ${change.nodeId} <${change.tag}> is new.`;
    case "removed":
      return `  - ${change.nodeId} <${change.tag}> is gone.`;
    case "retagged":
      return `  ~ ${change.nodeId} became <${change.tag}> (was <${change.beforeTag}>).`;
  }
}

function tokenLine(change: TokenChange): string {
  return `  ${change.explanation}`;
}

function styleSection(nodes: NodeStyleChange[]): string[] {
  const lines: string[] = [];
  let currentNode: string | null = null;

  for (const change of nodes) {
    if (change.nodeId !== currentNode) {
      currentNode = change.nodeId;
      lines.push(`  ${change.nodeId} <${change.tag}>`);
    }
    lines.push(`    ${change.explanation}`);
  }

  return lines;
}

/**
 * Renders a SemanticDiff as plain English for a terminal. Run-context warnings come first: if the
 * two runs did not look at the same thing, that colors every line under it.
 */
export function explainDiff(diff: SemanticDiff): string {
  const lines: string[] = [diff.headline];

  if (diff.contextWarnings.length > 0) {
    lines.push("");
    for (const warning of diff.contextWarnings) lines.push(`Warning: ${warning.message}`);
  }

  const sections: Array<[string, string[]]> = [
    ["Structure", diff.structure.map(structureLine)],
    ["Styles", styleSection(diff.nodes)],
    ["Tokens", diff.tokens.map(tokenLine)],
    ["Token debt", diff.debt.map((d) => `  ${d.kind}: ${d.explanation}`)],
  ];

  let printedSection = false;
  for (const [title, body] of sections) {
    if (body.length === 0) continue;
    printedSection = true;
    lines.push("", title, ...body);
  }

  if (!printedSection) {
    lines.push("", "No semantic changes.");
  }

  return lines.join("\n");
}
