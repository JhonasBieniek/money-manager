export type HealthResponse = {
  status: "ok" | "degraded";
  db?: "ok" | "unavailable";
};
