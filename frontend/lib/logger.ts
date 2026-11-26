// サーバー側でアプリが出すログを 1 行 1 件の JSON にする(docs/adr/0014)。
// Edge でも動くように process.stdout ではなく console に書く。warn と error は stderr、それ以外は stdout に出る

type Level = "debug" | "info" | "warn" | "error";

type Context = Record<string, unknown>;

// Error は列挙できるプロパティを持たず、JSON.stringify では {} になるので、読める形に直す
function serializeErrors(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

function write(level: Level, message: string, context: Context): void {
  const line = JSON.stringify(
    { level, message, time: new Date().toISOString(), context },
    serializeErrors,
  );
  if (level === "warn" || level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (message: string, context: Context = {}) => write("debug", message, context),
  info: (message: string, context: Context = {}) => write("info", message, context),
  warn: (message: string, context: Context = {}) => write("warn", message, context),
  error: (message: string, context: Context = {}) => write("error", message, context),
};
