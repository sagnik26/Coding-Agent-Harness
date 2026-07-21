const ESC = "\x1b[";
const RESET = `${ESC}0m`;
const GREEN = `${ESC}32m`;
const RED = `${ESC}31m`;
const YELLOW = `${ESC}33m`;

const ANSI_RE = /\x1b\[[0-9;]*m/g;

export const colorsEnabled = !("NO_COLOR" in process.env);

function wrap(code: string, text: string): string {
  if (!colorsEnabled) return text;
  return `${code}${text}${RESET}`;
}

export function green(text: string): string {
  return wrap(GREEN, text);
}

export function red(text: string): string {
  return wrap(RED, text);
}

export function yellow(text: string): string {
  return wrap(YELLOW, text);
}

export function visibleLength(text: string): number {
  return text.replace(ANSI_RE, "").length;
}

export function padVisible(text: string, width: number): string {
  const pad = width - visibleLength(text);
  return pad > 0 ? text + " ".repeat(pad) : text;
}

export function out(line: string): void {
  console.log(line);
}

export function err(line: string): void {
  console.error(line);
}
