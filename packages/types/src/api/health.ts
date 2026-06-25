export type HealthResponse = {
  status: "ok";
  db?: "ok" | "unavailable";
};
