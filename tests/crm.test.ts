// Integration: the CRM example uses accounts, relations with cascade, validations, uploads, live
// data, routes with a layout, a modal with a select, tabs, a keyed table and meta, together.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { launch } from "../benchmarks/eval/app.ts";

test("crm example: sign up, companies, contacts in a modal, stages, cascade delete", async () => {
  const { page: p, close } = await launch("artscript", { "app.art": readFileSync("examples/crm/app.art", "utf8") }, true);
  const has = (s: string) => p.text().includes(s);
  try {
    await p.until(() => has("Sign in"), "the sign-in card");
    await p.fill("Name (to sign up)", "Ana");
    await p.fill("Email", "ana@x.co");
    await p.fill("Password", "12345678");
    await p.click("Sign up");
    await p.until(() => has("Ana") && has("No contacts yet"), "signed in, on the contacts page");
    assert.equal(document.title, "Contacts");

    await p.link("Companies");
    await p.until(() => p.count("Add company") === 1, "the companies page");
    await p.fill("Company", "A");
    await p.click("Add company");
    await p.until(() => has("invalid name: expected at least 2 characters"), "the server's validation message");
    await p.fill("Company", "Acme");
    await p.click("Add company");
    await p.until(() => has("Acme") && p.count("Delete") === 1, "Acme listed");

    await p.link("Contacts");
    await p.click("New contact");
    await p.fill("Name", "Beto");
    await p.fill("Email", "beto@acme.co");
    await p.select(0, "Acme");
    await p.click("Save");
    await p.until(() => has("Beto") && has("Acme") && p.count("Save") === 0, "Beto at Acme, the modal closed");

    await p.click("Won");
    await p.until(() => has("customer"), "Beto is a customer");
    await p.click("lead");
    await p.until(() => has("No contacts yet"), "no leads left");
    await p.click("all");

    await p.link("Companies");
    await p.click("Delete");
    await p.until(() => p.count("Delete") === 0, "Acme deleted");
    await p.link("Contacts");
    await p.until(() => has("No contacts yet"), "its contacts deleted with it (cascade)");
  } finally {
    await close();
  }
});
