export function autosaveDelayMs(): number {
  if (process.env.NODE_ENV === "test") {
    return 0;
  }
  return 3000;
}
