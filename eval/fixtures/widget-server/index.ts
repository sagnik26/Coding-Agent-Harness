import { createApp } from "./src/app";
import { loadConfig } from "./src/config";

const config = loadConfig();
const app = createApp(config);
console.log(`App ready on port ${config.port}`);
export { app };
