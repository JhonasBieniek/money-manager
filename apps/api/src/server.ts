import "dotenv/config";
import { getJwtAccessSecret, getJwtRefreshSecret } from "./config/secrets.js";
import { createApp } from "./app.js";

getJwtAccessSecret();
getJwtRefreshSecret();

const port = Number(process.env.API_PORT ?? 3001);
const host = process.env.API_HOST ?? "0.0.0.0";

const app = createApp();

app.listen(port, host, () => {
  console.log(`api listening on http://${host}:${port}`);
});
