import assert from "node:assert/strict";
import test from "node:test";

const { GIT_DELEGATE_TOOL_NAMES, registerGitDelegateTools } = await import("../lib/register-tools.ts");

function createMockPi() {
  const tools = new Map();
  return {
    pi: {
      registerTool(options) {
        tools.set(options.name, options);
      },
    },
    tools,
  };
}

test("registerGitDelegateTools registers all three typed tools", () => {
  const { pi, tools } = createMockPi();
  registerGitDelegateTools(pi);

  assert.equal(tools.size, 3);
  for (const name of GIT_DELEGATE_TOOL_NAMES) {
    assert.equal(tools.has(name), true, `missing tool ${name}`);
    const registration = tools.get(name);
    assert.equal(typeof registration.execute, "function");
    assert.ok(registration.parameters.properties.provider);
    assert.ok(registration.parameters.properties.model);
  }
});

test("extension entrypoint exports a registration function", async () => {
  const extension = await import("../extensions/index.ts");
  assert.equal(typeof extension.default, "function");
});
