import type { ReactNode } from "react";

type MathTextSegment =
  | { kind: "text"; value: string }
  | { kind: "math"; value: string; display: boolean }
  | { kind: "chem"; value: string };

const mathCommandSymbols: Record<string, string> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  theta: "θ",
  lambda: "λ",
  mu: "μ",
  pi: "π",
  rho: "ρ",
  sigma: "σ",
  omega: "ω",
  Delta: "Δ",
  Omega: "Ω",
  times: "×",
  cdot: "·",
  div: "÷",
  pm: "±",
  le: "≤",
  leq: "≤",
  ge: "≥",
  geq: "≥",
  neq: "≠",
  approx: "≈",
  infty: "∞",
  degree: "°",
  to: "→",
  rightarrow: "→",
  leftarrow: "←",
  leftrightarrow: "↔",
  sum: "∑",
  int: "∫",
  lim: "lim"
};

export function hasMathText(value: string | null | undefined) {
  if (!value) return false;
  return /(\$\$?[^$]+\$\$?|\\\(|\\\[|\\ce\{|\\frac|\\sqrt|[_^])/.test(value);
}

export function MathText({
  children,
  className = "",
  emptyFallback = null
}: {
  children?: string | null;
  className?: string;
  emptyFallback?: ReactNode;
}) {
  const text = children ?? "";
  if (!text.trim()) {
    return emptyFallback ? <>{emptyFallback}</> : null;
  }
  return (
    <span className={className}>
      {parseMathTextSegments(text).map((segment, index) => renderSegment(segment, `segment-${index}`))}
    </span>
  );
}

function parseMathTextSegments(text: string) {
  const segments: MathTextSegment[] = [];
  let index = 0;
  while (index < text.length) {
    if (text.startsWith("$$", index)) {
      const end = text.indexOf("$$", index + 2);
      if (end > index) {
        segments.push({ kind: "math", value: text.slice(index + 2, end), display: true });
        index = end + 2;
        continue;
      }
    }
    if (text.startsWith("\\[", index)) {
      const end = text.indexOf("\\]", index + 2);
      if (end > index) {
        segments.push({ kind: "math", value: text.slice(index + 2, end), display: true });
        index = end + 2;
        continue;
      }
    }
    if (text.startsWith("\\(", index)) {
      const end = text.indexOf("\\)", index + 2);
      if (end > index) {
        segments.push({ kind: "math", value: text.slice(index + 2, end), display: false });
        index = end + 2;
        continue;
      }
    }
    if (text.startsWith("\\ce{", index)) {
      const group = readBalancedGroup(text, index + 3);
      if (group) {
        segments.push({ kind: "chem", value: group.content });
        index = group.nextIndex;
        continue;
      }
    }
    if (text[index] === "$") {
      const end = text.indexOf("$", index + 1);
      if (end > index) {
        segments.push({ kind: "math", value: text.slice(index + 1, end), display: false });
        index = end + 1;
        continue;
      }
    }

    const nextIndex = nextMarkerIndex(text, index + 1);
    segments.push({ kind: "text", value: text.slice(index, nextIndex) });
    index = nextIndex;
  }
  return segments;
}

function nextMarkerIndex(text: string, start: number) {
  const markers = ["$$", "$", "\\(", "\\[", "\\ce{"];
  const candidates = markers
    .map((marker) => text.indexOf(marker, start))
    .filter((candidate) => candidate >= 0);
  return candidates.length ? Math.min(...candidates) : text.length;
}

function renderSegment(segment: MathTextSegment, key: string) {
  if (segment.kind === "text") {
    return <span key={key}>{renderPlainText(segment.value, key)}</span>;
  }
  if (segment.kind === "chem") {
    return <ChemistryFormula key={key} value={segment.value} />;
  }
  return <Formula key={key} value={segment.value} display={segment.display} />;
}

function renderPlainText(text: string, keyPrefix: string) {
  return text.split("\n").flatMap((line, index, lines) => {
    const items: ReactNode[] = [line];
    if (index < lines.length - 1) {
      items.push(<br key={`${keyPrefix}-br-${index}`} />);
    }
    return items;
  });
}

function Formula({ value, display }: { value: string; display: boolean }) {
  const className = display
    ? "my-3 block overflow-x-auto rounded-lg border border-slate-200 bg-white px-4 py-3 text-center font-serif text-lg leading-9 text-ink"
    : "mx-0.5 inline-flex max-w-full align-middle font-serif text-[1.03em] leading-none text-ink";
  return <span className={className}>{renderFormulaNodes(value.trim(), "formula")}</span>;
}

function renderFormulaNodes(expression: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let index = 0;
  while (index < expression.length) {
    if (/\s/.test(expression[index])) {
      nodes.push(" ");
      index += 1;
      continue;
    }
    const atom = parseFormulaAtom(expression, index, `${keyPrefix}-${nodes.length}`);
    const scripted = applyFormulaScripts(expression, atom.nextIndex, atom.node, `${keyPrefix}-${nodes.length}`);
    nodes.push(scripted.node);
    index = scripted.nextIndex;
  }
  return nodes;
}

function parseFormulaAtom(expression: string, index: number, key: string): { node: ReactNode; nextIndex: number } {
  const char = expression[index];
  if (char === "{") {
    const group = readBalancedGroup(expression, index);
    if (group) {
      return { node: <span key={key}>{renderFormulaNodes(group.content, `${key}-group`)}</span>, nextIndex: group.nextIndex };
    }
  }

  if (char === "\\") {
    const command = readCommand(expression, index);
    if (command.name === "frac" || command.name === "dfrac" || command.name === "tfrac") {
      const numerator = readNextFormulaGroup(expression, command.nextIndex);
      const denominator = numerator ? readNextFormulaGroup(expression, numerator.nextIndex) : null;
      if (numerator && denominator) {
        return {
          node: (
            <span key={key} className="mx-1 inline-flex min-w-8 flex-col items-stretch align-middle text-center leading-none">
              <span className="border-b border-current px-1 pb-0.5">{renderFormulaNodes(numerator.content, `${key}-num`)}</span>
              <span className="px-1 pt-0.5">{renderFormulaNodes(denominator.content, `${key}-den`)}</span>
            </span>
          ),
          nextIndex: denominator.nextIndex
        };
      }
    }
    if (command.name === "sqrt") {
      const radicand = readNextFormulaGroup(expression, command.nextIndex);
      if (radicand) {
        return {
          node: (
            <span key={key} className="inline-flex items-start align-middle">
              <span className="text-[1.15em] leading-none">√</span>
              <span className="border-t border-current px-1">{renderFormulaNodes(radicand.content, `${key}-sqrt`)}</span>
            </span>
          ),
          nextIndex: radicand.nextIndex
        };
      }
    }
    if (command.name === "ce") {
      const group = readNextFormulaGroup(expression, command.nextIndex);
      if (group) {
        return { node: <ChemistryFormula key={key} value={group.content} />, nextIndex: group.nextIndex };
      }
    }
    if (command.name === "mathrm" || command.name === "text") {
      const group = readNextFormulaGroup(expression, command.nextIndex);
      if (group) {
        return { node: <span key={key} className="font-sans">{group.content}</span>, nextIndex: group.nextIndex };
      }
    }
    if (command.name === "left" || command.name === "right") {
      return { node: null, nextIndex: command.nextIndex };
    }
    return {
      node: mathCommandSymbols[command.name] ?? `\\${command.name}`,
      nextIndex: command.nextIndex
    };
  }

  return { node: char, nextIndex: index + 1 };
}

function applyFormulaScripts(expression: string, startIndex: number, baseNode: ReactNode, key: string) {
  let index = startIndex;
  let superscript = "";
  let subscript = "";
  while (expression[index] === "^" || expression[index] === "_") {
    const scriptType = expression[index];
    const script = readScriptExpression(expression, index + 1);
    if (!script) break;
    if (scriptType === "^") {
      superscript = script.content;
    } else {
      subscript = script.content;
    }
    index = script.nextIndex;
  }

  if (!superscript && !subscript) {
    return { node: <span key={key}>{baseNode}</span>, nextIndex: index };
  }

  return {
    node: (
      <span key={key} className="inline-flex items-start align-baseline">
        <span>{baseNode}</span>
        <span className="ml-0.5 inline-flex flex-col text-[0.68em] leading-none">
          {superscript ? <span>{renderFormulaNodes(superscript, `${key}-sup`)}</span> : <span>&nbsp;</span>}
          {subscript ? <span>{renderFormulaNodes(subscript, `${key}-sub`)}</span> : null}
        </span>
      </span>
    ),
    nextIndex: index
  };
}

function readCommand(expression: string, index: number) {
  let cursor = index + 1;
  while (/[A-Za-z]/.test(expression[cursor] ?? "")) {
    cursor += 1;
  }
  if (cursor === index + 1) {
    cursor += 1;
  }
  return {
    name: expression.slice(index + 1, cursor),
    nextIndex: cursor
  };
}

function skipSpaces(expression: string, index: number) {
  let cursor = index;
  while (/\s/.test(expression[cursor] ?? "")) {
    cursor += 1;
  }
  return cursor;
}

function readNextFormulaGroup(expression: string, index: number) {
  const cursor = skipSpaces(expression, index);
  if (expression[cursor] === "{") {
    return readBalancedGroup(expression, cursor);
  }
  if (cursor < expression.length) {
    return { content: expression[cursor], nextIndex: cursor + 1 };
  }
  return null;
}

function readScriptExpression(expression: string, index: number) {
  const cursor = skipSpaces(expression, index);
  if (expression[cursor] === "{") {
    return readBalancedGroup(expression, cursor);
  }
  if (expression[cursor] === "\\") {
    const command = readCommand(expression, cursor);
    return { content: expression.slice(cursor, command.nextIndex), nextIndex: command.nextIndex };
  }
  if (cursor < expression.length) {
    return { content: expression[cursor], nextIndex: cursor + 1 };
  }
  return null;
}

function readBalancedGroup(text: string, openIndex: number) {
  if (text[openIndex] !== "{") {
    return null;
  }
  let depth = 0;
  for (let index = openIndex; index < text.length; index += 1) {
    if (text[index] === "{") depth += 1;
    if (text[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return {
          content: text.slice(openIndex + 1, index),
          nextIndex: index + 1
        };
      }
    }
  }
  return null;
}

function ChemistryFormula({ value }: { value: string }) {
  const normalized = value
    .replaceAll("<=>", "⇌")
    .replaceAll("->", "→")
    .replaceAll("<-", "←");
  return (
    <span className="mx-0.5 inline-flex align-middle font-serif text-[1.03em] text-ink">
      {renderChemistryNodes(normalized)}
    </span>
  );
}

function renderChemistryNodes(value: string) {
  const nodes: ReactNode[] = [];
  let index = 0;
  while (index < value.length) {
    const char = value[index];
    if (/\d/.test(char)) {
      let end = index + 1;
      while (/\d/.test(value[end] ?? "")) end += 1;
      const previous = previousNonSpace(value, index);
      const next = value[end] ?? "";
      const isCoefficient = (!previous || ["+", "→", "←", "⇌"].includes(previous)) && /[A-Z(]/.test(next);
      nodes.push(
        isCoefficient ? (
          value.slice(index, end)
        ) : (
          <sub key={`chem-sub-${index}`} className="text-[0.68em]">{value.slice(index, end)}</sub>
        )
      );
      index = end;
      continue;
    }
    if (char === "^") {
      const script = readScriptExpression(value, index + 1);
      if (script) {
        nodes.push(<sup key={`chem-sup-${index}`} className="text-[0.68em]">{script.content}</sup>);
        index = script.nextIndex;
        continue;
      }
    }
    nodes.push(char);
    index += 1;
  }
  return nodes;
}

function previousNonSpace(value: string, index: number) {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (!/\s/.test(value[cursor])) {
      return value[cursor];
    }
  }
  return "";
}
