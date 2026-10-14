/**
 * Flag parsing. Flags may come as real argv entries or at the very start of the text piped
 * through stdin (the slash commands forward $ARGUMENTS in a quoted heredoc, so the user's
 * "--base main revisa la auth" arrives as one string).
 */

export const BOOLEAN_FLAGS = new Set(['background', 'wait', 'resume', 'fresh', 'json', 'reset', 'all', 'full-access']);
export const VALUE_FLAGS = new Set(['engine', 'model', 'effort', 'base', 'scope', 'conversation', 'file']);
const SHORT_FLAGS = { '-h': 'help', '-v': 'version' };

function isKnownFlag(name) {
  return BOOLEAN_FLAGS.has(name) || VALUE_FLAGS.has(name) || name === 'help' || name === 'version';
}

/**
 * Parse argv: the first positional is the action, the rest is free text.
 * @returns {{ action: string, flags: Record<string, string|boolean>, text: string }}
 */
export function parseArgv(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (SHORT_FLAGS[arg]) {
      flags[SHORT_FLAGS[arg]] = true;
      continue;
    }
    const match = /^--([a-z-]+)(?:=(.*))?$/.exec(arg);
    if (match && isKnownFlag(match[1])) {
      const [, name, inline] = match;
      if (VALUE_FLAGS.has(name)) {
        const value = inline ?? argv[i + 1];
        if (value === undefined) throw new Error(`Falta el valor de --${name}`);
        if (inline === undefined) i++;
        flags[name] = value;
      } else {
        flags[name] = true;
      }
      continue;
    }
    positional.push(arg);
  }
  let action = positional.shift() || 'help';
  if (flags.help) action = 'help';
  else if (flags.version) action = 'version';
  return { action, flags, text: positional.join(' ').trim() };
}

/**
 * Pull known flags off the start of free text; stops at the first word that is not a flag.
 * @returns {{ flags: Record<string, string|boolean>, text: string }}
 */
export function splitLeadingFlags(input) {
  const flags = {};
  let rest = input || '';
  for (;;) {
    const match = /^\s*--([a-z-]+)(?:=(\S+))?(?=\s|$)/.exec(rest);
    if (!match || !isKnownFlag(match[1])) break;
    const [whole, name, inline] = match;
    rest = rest.slice(whole.length);
    if (VALUE_FLAGS.has(name)) {
      if (inline !== undefined) {
        flags[name] = inline;
      } else {
        const value = /^\s+(\S+)/.exec(rest);
        if (!value) throw new Error(`Falta el valor de --${name}`);
        flags[name] = value[1];
        rest = rest.slice(value[0].length);
      }
    } else {
      flags[name] = true;
    }
  }
  return { flags, text: rest.trim() };
}
