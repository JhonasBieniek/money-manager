import type { SuperAgentTest } from "supertest";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "../../src/shared/middleware/csrf.js";

export async function primeCsrfAgent(agent: SuperAgentTest): Promise<string> {
  const res = await agent.get("/v1/auth/csrf");
  if (res.status !== 204) {
    throw new Error(`Falha ao obter token CSRF: status ${res.status}`);
  }

  const setCookie = res.headers["set-cookie"];
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const csrfCookie = cookies.find((entry) => entry.startsWith(`${CSRF_COOKIE_NAME}=`));
  if (!csrfCookie) {
    throw new Error("Cookie CSRF ausente na resposta");
  }

  const value = csrfCookie.split(";")[0]?.split("=")[1];
  if (!value) {
    throw new Error("Valor do cookie CSRF inválido");
  }

  return decodeURIComponent(value);
}

export function withCsrfHeader(agent: SuperAgentTest, token: string) {
  return agent.set(CSRF_HEADER_NAME, token);
}
