export interface Config {
  port: number;
  env: string;
}

export function loadConfig(): Config {
  return { port: 3000, env: "development" };
}
