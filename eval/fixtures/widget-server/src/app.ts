import type { Config } from "./config";

export function createApp(config: Config) {
  return {
    name: "medium-app",
    port: config.port,
    start() {
      return `listening on ${config.port}`;
    },
  };
}
