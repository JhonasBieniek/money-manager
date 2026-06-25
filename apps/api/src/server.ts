import "dotenv/config";
import { createApp } from "./app.js";

const port = Number(process.env.API_PORT ?? 3001);
const host = process.env.API_HOST ?? "0.0.0.0";

const app = createApp();

app.listen(port, host, () => {
  console.log(`api listening on http://${host}:${port}`);
});
