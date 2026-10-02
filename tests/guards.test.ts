// `page X "/x" requires login|admin`: the router shows the page only with access.
import assert from "node:assert/strict";
import { test } from "node:test";
import { launch } from "../benchmarks/eval/app.ts";
import { check } from "../src/checker.ts";
import { parse } from "../src/parser.ts";
import { printProgram } from "../src/printer.ts";

const SRC = `model User {
  id: ID
  email: Email
  password: String
  role: String
}

api users: User

auth users

page Home "/" {
  title "Home"
}

page Login "/login" {
  data me = auth.me()
  state email = ""
  state password = ""

  title "Sign in"
  input email placeholder="Email"
  input password placeholder="Password" type=password
  button "Sign up" -> auth.signup({ email, password, role: "" })
  button "Log in" -> auth.login(email, password)
  if me {
    text \`Signed in as \${me.email}\`
  }
  link "Notes" to="/notes"
  link "Admin" to="/admin"
}

page Notes "/notes" requires login {
  title "Private notes"
}

page Admin "/admin" requires admin {
  title "Admin panel"
}
`;

test("requires: syntax and needs accounts", () => {
  assert.equal(printProgram(parse(SRC, "t")), SRC);
  assert.deepEqual(check(parse(SRC, "t")).map((d) => d.type), []);
  assert.deepEqual(check(parse('page P "/p" requires login {\n  text "x"\n}\n', "t")).map((d) => d.type), ["AUTH_REQUIRED"]);
});

test("requires: no session goes to /login; signed in sees it; admin only for admins", async () => {
  const { page: p, close } = await launch("artscript", { "app.art": SRC }, true);
  try {
    await p.open("/notes");
    await p.until(() => p.path() === "/login" && p.text().includes("Sign in"), "sent to /login without a session");
    assert.ok(!p.text().includes("Private notes"));
    // The first account is the admin.
    await p.fill("Email", "a@x.co");
    await p.fill("Password", "12345678");
    await p.click("Sign up");
    await p.until(() => p.text().includes("Signed in as a@x.co"), "signed in");
    // A new window would be a new browser without the session cookie: navigate in the app.
    await p.link("Notes");
    await p.until(() => p.text().includes("Private notes"), "the notes page once signed in");
    history.back();
    await p.until(() => p.path() === "/login", "back on /login");
    await p.link("Admin");
    await p.until(() => p.text().includes("Admin panel"), "the admin panel for the admin");
  } finally {
    await close();
  }
});
