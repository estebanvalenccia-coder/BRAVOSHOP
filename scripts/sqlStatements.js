export function splitSqlStatements(source) {
  const statements = [];
  let start = 0;
  let index = 0;
  let quote = null;
  let dollarQuote = null;
  let lineComment = false;
  let blockCommentDepth = 0;

  while (index < source.length) {
    const current = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (current === "\n") lineComment = false;
      index++;
      continue;
    }
    if (blockCommentDepth > 0) {
      if (current === "/" && next === "*") {
        blockCommentDepth++;
        index += 2;
      } else if (current === "*" && next === "/") {
        blockCommentDepth--;
        index += 2;
      } else index++;
      continue;
    }
    if (dollarQuote) {
      if (source.startsWith(dollarQuote, index)) {
        index += dollarQuote.length;
        dollarQuote = null;
      } else index++;
      continue;
    }
    if (quote) {
      if (current === quote && next === quote) index += 2;
      else if (current === quote) {
        quote = null;
        index++;
      } else index++;
      continue;
    }
    if (current === "-" && next === "-") {
      lineComment = true;
      index += 2;
      continue;
    }
    if (current === "/" && next === "*") {
      blockCommentDepth = 1;
      index += 2;
      continue;
    }
    if (current === "'" || current === '"') {
      quote = current;
      index++;
      continue;
    }
    if (current === "$") {
      const delimiter = source.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)?.[0];
      if (delimiter) {
        dollarQuote = delimiter;
        index += delimiter.length;
        continue;
      }
    }
    if (current === ";") {
      const statement = source.slice(start, index).trim();
      if (statement) statements.push(statement);
      start = index + 1;
    }
    index++;
  }

  if (quote || dollarQuote || blockCommentDepth > 0) throw new Error("SQL contiene una cadena o comentario sin cerrar");
  const remainder = source.slice(start).trim();
  if (remainder) statements.push(remainder);
  return statements;
}