import assert from "node:assert/strict";
import test from "node:test";
import { invitationToken, passwordProblem, pendingFrom, readPending, validEmail } from "../src/lib/auth-rules.ts";
import { csvRows, fileSize, safeName } from "../src/lib/file-rules.ts";
import { noticeTarget } from "../src/lib/notice-rules.ts";

const token = "a".repeat(43);
test("invitation tokens come from app and website links, and nothing else", () => {
  assert.equal(invitationToken({ token }), token);
  assert.equal(invitationToken({ "#": "token=" + token }), token);
  assert.equal(invitationToken({}), undefined);
  for (const bad of ["short", token + "x", token.slice(1) + "/"]) assert.equal(invitationToken({ token: bad }), null);
});
test("a kept invitation lasts one day", () => {
  const text = JSON.stringify(pendingFrom("family", token, 1000));
  assert.equal(readPending(text, 2000)?.token, token);
  assert.equal(readPending(text, 1001 + 24 * 60 * 60_000), null);
  for (const bad of [null, "x", "{}", JSON.stringify({ kind: "other", token, until: 9e15 })]) assert.equal(readPending(bad, 1), null);
});
test("passwords and emails follow the web rules", () => {
  assert.ok(passwordProblem("short"));
  assert.ok(passwordProblem("é".repeat(40)));
  assert.equal(passwordProblem("long enough"), null);
  assert.ok(validEmail(" a@b.co ") && !validEmail("a@b"));
});
test("notifications open only what this app shows", () => {
  assert.deepEqual(noticeTarget("/message/?family=f&conversation=c&id=m", "f", []), { pathname: "/chat/[id]", params: { id: "c", message: "m" } });
  assert.deepEqual(noticeTarget("/message/?family=g&conversation=c&id=m", "f", ["c"]), { pathname: "/chat/[id]", params: { id: "c", message: "m", family: "g" } });
  for (const path of ["/message/?family=g&conversation=c&id=m", "/task/?family=g&id=t", "/event/?family=g&id=e", "/unknown/?family=f&id=x"]) assert.equal(noticeTarget(path, "f", []), null);
  assert.deepEqual(noticeTarget("/event/?family=f&id=e&occurrence=2026-01-01", "f", [])?.params, { id: "e", occurrence: "2026-01-01" });
  assert.equal(noticeTarget("/task/?family=f&id=t", null, []), null);
});
test("file names, sizes and spreadsheets are shown safely", () => {
  assert.equal(safeName("../../a b.pdf"), "__.._a b.pdf");
  assert.equal(safeName(""), "file");
  assert.equal(fileSize(1536), "1.5 KB");
  assert.deepEqual(csvRows('a,"b, ""c"""\r\n1,"two\nlines"'), [["a", 'b, "c"'], ["1", "two\nlines"]]);
  assert.equal(csvRows("x\n".repeat(50)).length, 21);
});
