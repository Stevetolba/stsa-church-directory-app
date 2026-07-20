// Short numeric code printed on a checked-in child's label and a matching
// tag for the adult who dropped them off, so pickup can be verified at a
// glance (ADR-0015). Pure/testable — avoids colliding with codes already
// active for the same occurrence (e.g. another family currently checked in).

const CODE_LENGTH = 4;
const MIN = 10 ** (CODE_LENGTH - 1);
const MAX = 10 ** CODE_LENGTH - 1;
const MAX_ATTEMPTS = 50;

export function generateMatchCode(activeCodes: ReadonlySet<string> = new Set()): string {
  let code = "";
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    code = String(Math.floor(Math.random() * (MAX - MIN + 1)) + MIN);
    if (!activeCodes.has(code)) return code;
  }
  // Active codes cover (close to) the whole 4-digit space — astronomically
  // unlikely in practice, but return the last draw rather than loop forever.
  return code;
}

export function isValidMatchCode(code: string): boolean {
  return new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code);
}
