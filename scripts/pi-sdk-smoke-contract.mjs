export const VERIFICATION_CONTRACT = "pi-sdk-behavior-v2";
export const SDK_VERSIONS = {
  "@earendil-works/pi-agent-core": "1.1.0",
  "@earendil-works/pi-ai": "1.1.0",
  "@earendil-works/pi-coding-agent": "1.1.0",
  "@earendil-works/pi-tui": "1.1.0",
};

export const EXPECTED_COMMANDS = ["git-delegate:configure", "git-delegate:status"];
export const EXPECTED_TOOLS = ["git_diff_summary", "git_log_summary", "git_blame_summary"];
export const DELEGATED_SUMMARY = "Offline deterministic git summary.";
export const UNHANDLED_ERROR_PATTERN = /UnhandledPromiseRejection|uncaught exception|shutdown error/i;
export const EXTENSION_LOAD_ERROR_PATTERN = /Failed to load extension|Error loading extension|Extension load error/i;

export function parseJsonLines(output) {
  const records = [];
  const invalidLines = [];
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      invalidLines.push(line);
    }
  }
  return { records, invalidLines };
}

function assertion(id, expected, observed, passed) {
  return { id, expected, observed: JSON.stringify(observed), passed: passed === true };
}

function outputText(toolEvent) {
  const content = toolEvent?.result?.content;
  return Array.isArray(content)
    ? content.filter((block) => block?.type === "text").map((block) => block.text).join("\n")
    : "";
}

function hasCommands(commands) {
  return EXPECTED_COMMANDS.every((name) => commands.includes(name));
}

export function behaviorAssertions(name, observation) {
  const { exit_code = 1, stderr = "", protocol_invalid = false } = observation;
  const cleanRuntime = !UNHANDLED_ERROR_PATTERN.test(stderr) && !protocol_invalid;

  if (name === "extension_load") {
    const commands = observation.commands ?? [];
    return [assertion("extension_registered",
      "Actual Pi RPC reports both pi-git-delegate commands after loading the extension",
      { commands, exit_code, natural_exit: observation.natural_exit },
      exit_code === 0 && observation.natural_exit === true && hasCommands(commands) && cleanRuntime)];
  }

  if (name === "happy_path") {
    const events = observation.tool_events ?? [];
    const tools = EXPECTED_TOOLS.map((toolName) => events.find((event) => event.toolName === toolName));
    const summaries = tools.map((event) => outputText(event));
    const passed = exit_code === 0 && cleanRuntime
      && tools.every((event) => event && event.isError === false)
      && summaries.every((text) => text === DELEGATED_SUMMARY)
      && observation.natural_exit === true
      && observation.local_provider_subagent_calls >= EXPECTED_TOOLS.length;
    return [assertion("feature_response",
      "Real Pi executes diff, log, and blame tools, each delegates to the isolated loopback model, and returns its summary",
      { tools: tools.map((event, index) => ({ name: EXPECTED_TOOLS[index], isError: event?.isError ?? null,
        text: summaries[index] })), local_provider_subagent_calls: observation.local_provider_subagent_calls ?? 0,
        exit_code, natural_exit: observation.natural_exit }, passed)];
  }

  if (name === "error_path") {
    const event = (observation.tool_events ?? []).find((row) => row.toolName === "git_blame_summary");
    const text = outputText(event);
    const handled = event?.isError === false && event?.result?.details?.error === true
      && /fatal:|no such file|cannot stat/i.test(text);
    return [assertion("handled_error",
      "A missing blame target returns the extension's structured error result while the actual Pi host remains healthy",
      { isError: event?.isError ?? null, details: event?.result?.details ?? null, text, exit_code },
      exit_code === 0 && observation.natural_exit === true && cleanRuntime && handled)];
  }

  if (name === "reload_cleanup") {
    const commands = observation.reloaded_commands ?? [];
    const events = observation.reloaded_tool_events ?? [];
    const event = events.find((row) => row.toolName === "git_diff_summary");
    const text = outputText(event);
    return [
      assertion("reloaded_extension_registered",
        "A second actual Pi process freshly loads both pi-git-delegate commands",
        { commands, exit_code: observation.first_exit_code }, observation.first_exit_code === 0 && hasCommands(commands)),
      assertion("reloaded_feature_response",
        "The second Pi process executes git_diff_summary and returns the deterministic delegated feature response",
        { isError: event?.isError ?? null, text, local_provider_subagent_calls: observation.local_provider_subagent_calls ?? 0 },
        exit_code === 0 && cleanRuntime && event?.isError === false && text === DELEGATED_SUMMARY
          && observation.local_provider_subagent_calls >= 1),
      assertion("clean_shutdown",
        "Both actual Pi processes close stdin, exit naturally with code zero, and emit no shutdown or unhandled error",
        { first_exit_code: observation.first_exit_code, first_natural_exit: observation.first_natural_exit,
          exit_code, natural_exit: observation.natural_exit, stderr },
        observation.first_exit_code === 0 && observation.first_natural_exit === true
          && exit_code === 0 && observation.natural_exit === true && cleanRuntime),
    ];
  }

  if (name === "host_shell") {
    const output = (observation.stdout ?? "").trim();
    return [assertion("native_shell_boundary",
      "The native host shell launches the locally pinned Pi CLI and returns exactly its SDK version",
      { output, expected_version: observation.expected_version, exit_code },
      exit_code === 0 && observation.natural_exit === true && cleanRuntime && output === observation.expected_version)];
  }

  throw new Error(`Unknown Pi SDK smoke case: ${name}`);
}
