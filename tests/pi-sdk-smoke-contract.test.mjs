import assert from "node:assert/strict";
import test from "node:test";
import {
  behaviorAssertions, DELEGATED_SUMMARY, EXPECTED_COMMANDS, EXPECTED_TOOLS, parseJsonLines,
  SDK_VERSIONS, VERIFICATION_CONTRACT,
} from "../scripts/pi-sdk-smoke-contract.mjs";

const commandObservation = (commands = EXPECTED_COMMANDS, exit_code = 0) => ({ commands, exit_code, natural_exit: exit_code === 0 });
const toolEvent = (toolName, text = DELEGATED_SUMMARY, details = {}, isError = false) => ({
  type: "tool_execution_end", toolName, isError,
  result: { content: [{ type: "text", text }], details },
});

test("behavior-v2 contract and frozen SDK inventory are exact", () => {
  assert.equal(VERIFICATION_CONTRACT, "pi-sdk-behavior-v2");
  assert.deepEqual(Object.values(SDK_VERSIONS), ["1.2.0", "1.2.0", "1.2.0", "1.2.0"]);
  assert.deepEqual(EXPECTED_TOOLS, ["git_diff_summary", "git_log_summary", "git_blame_summary"]);
});

test("RPC JSONL parser accepts CRLF and rejects malformed output for the caller", () => {
  const parsed = parseJsonLines(`noise\r\n${JSON.stringify({ type: "response", success: true })}\n`);
  assert.deepEqual(parsed.records, [{ type: "response", success: true }]);
  assert.deepEqual(parsed.invalidLines, ["noise"]);
});

test("extension registration requires both observed commands and a clean host exit", () => {
  assert.equal(behaviorAssertions("extension_load", commandObservation())[0].passed, true);
  assert.equal(behaviorAssertions("extension_load", commandObservation([EXPECTED_COMMANDS[0]]))[0].passed, false);
  assert.equal(behaviorAssertions("extension_load", commandObservation(EXPECTED_COMMANDS, 1))[0].passed, false);
});

test("happy path requires all three real tool responses and deterministic subagent calls", () => {
  const events = EXPECTED_TOOLS.map((name) => toolEvent(name));
  assert.equal(behaviorAssertions("happy_path", {
    tool_events: events, local_provider_subagent_calls: 3, exit_code: 0, natural_exit: true,
  })[0].passed, true);
  for (const missing of [events.slice(0, 2), [toolEvent(EXPECTED_TOOLS[0], "raw git diff"), ...events.slice(1)]]) {
    assert.equal(behaviorAssertions("happy_path", {
      tool_events: missing, local_provider_subagent_calls: 3, exit_code: 0,
      natural_exit: true,
    })[0].passed, false);
  }
  assert.equal(behaviorAssertions("happy_path", {
    tool_events: events, local_provider_subagent_calls: 2, exit_code: 0, natural_exit: true,
  })[0].passed, false);
});

test("error path requires the missing-file error details and actual diagnostic", () => {
  const good = toolEvent("git_blame_summary", "fatal: cannot stat 'missing.txt'", { error: true });
  assert.equal(behaviorAssertions("error_path", { tool_events: [good], exit_code: 0, natural_exit: true })[0].passed, true);
  for (const event of [undefined, toolEvent("git_blame_summary", "", { error: true }),
    toolEvent("git_blame_summary", "fatal: missing", {}, false)]) {
    assert.equal(behaviorAssertions("error_path", { tool_events: event ? [event] : [], exit_code: 0,
      natural_exit: true })[0].passed, false);
  }
});

test("reload requires second-process registration, a feature response, and natural clean shutdown", () => {
  const good = {
    reloaded_commands: EXPECTED_COMMANDS,
    reloaded_tool_events: [toolEvent("git_diff_summary")],
    local_provider_subagent_calls: 1,
    first_exit_code: 0, first_natural_exit: true, exit_code: 0, natural_exit: true,
  };
  assert.deepEqual(behaviorAssertions("reload_cleanup", good).map((item) => item.id), [
    "reloaded_extension_registered", "reloaded_feature_response", "clean_shutdown",
  ]);
  assert.ok(behaviorAssertions("reload_cleanup", good).every((item) => item.passed));
  for (const invalid of [
    { ...good, reloaded_commands: [] },
    { ...good, reloaded_tool_events: [] },
    { ...good, local_provider_subagent_calls: 0 },
    { ...good, exit_code: 1, natural_exit: false },
    { ...good, stderr: "shutdown error" },
  ]) {
    assert.ok(behaviorAssertions("reload_cleanup", invalid).some((item) => !item.passed));
  }
});

test("native shell case checks the exact pinned version rather than a substring", () => {
  assert.equal(behaviorAssertions("host_shell", { stdout: "1.2.0\r\n", expected_version: "1.2.0",
    exit_code: 0, natural_exit: true })[0].passed, true);
  for (const stdout of ["", "11.2.0", "1.2.0 error"]) {
    assert.equal(behaviorAssertions("host_shell", { stdout, expected_version: "1.2.0", exit_code: 0,
      natural_exit: true })[0].passed, false);
  }
});
