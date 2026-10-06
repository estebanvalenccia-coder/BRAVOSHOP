import assert from "node:assert/strict";
import test from "node:test";
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