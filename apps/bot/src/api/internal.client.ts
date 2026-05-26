export type InternalClientConfig = {
  apiBaseUrl: string;
  internalApiKey: string;
};

export function createInternalClient(config: InternalClientConfig) {
  const headers = {
    "content-type": "application/json",
    "x-internal-api-key": config.internalApiKey,
  };

  return {
    async postJson(path: string, body: unknown): Promise<Response> {
      const url = `${config.apiBaseUrl.replace(/\/$/, "")}${path}`;
      return fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    },
    async getJson(pathWithQuery: string): Promise<Response> {
      const url = `${config.apiBaseUrl.replace(/\/$/, "")}${pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`}`;
      return fetch(url, { method: "GET", headers });
    },
  };
}

export type InternalApiClient = ReturnType<typeof createInternalClient>;
