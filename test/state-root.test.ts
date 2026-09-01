import assert from "node:assert/strict";
import test from "node:test";

import { toWslPath } from "../src/cli.js";

test("maps a Windows shared state path into its WSL mount", () => {
  assert.equal(
    toWslPath("C:\\Users\\penhin\\AppData\\Local\\Skillset"),
    "/mnt/c/Users/penhin/AppData/Local/Skillset",
  );
});
