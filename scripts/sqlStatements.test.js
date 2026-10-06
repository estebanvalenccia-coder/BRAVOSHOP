import assert from "node:assert/strict";
import test from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { splitSqlStatements } from "./sqlStatements.js";

test("preserves semicolons inside quotes, comments, and dollar-quoted functions", () => {
  const source = `
    insert into notes(value) values ('one; two');
    -- keep ; in this comment
    create function example() returns text as $body$
    begin
      return 'inside; function';
    end;
    $body$ language plpgsql;
    /* nested /* comment; */ remains */ select 1;
  `;

  assert.equal(splitSqlStatements(source).length, 3);
});

test("rejects unterminated SQL quoting", () => {
  assert.throws(() => splitSqlStatements("select 'unfinished"), /sin cerrar/);
});

test("all versioned Neon migrations split into complete SQL statements", async () => {
  const directory = new URL("../database/migrations/", import.meta.url);
  const files = (await readdir(directory)).filter(file => file.endsWith(".sql"));
  assert.ok(files.length > 0);

  for (const file of files) {
    const source = await readFile(new URL(file, directory), "utf8");
    assert.ok(splitSqlStatements(source).length > 0, `${file} contains no SQL`);
  }
});