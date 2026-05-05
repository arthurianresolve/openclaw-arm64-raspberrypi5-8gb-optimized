import { normalizeOptionalString } from "../shared/string-coerce.js";

export function safeParseJson(value: string | null | undefined): unknown {
  const trimmed = normalizeOptionalString(value);
  if (!trimmed) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return { payloadJSON: value };
  }
}
