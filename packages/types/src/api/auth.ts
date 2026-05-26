/** Resposta JSON de login bem-sucedido (sem refresh nem segredos). */
export interface LoginSuccessBody {
  accessToken: string;
  tokenType: "Bearer";
  expiresInSeconds: number;
}

/** Resposta JSON de cadastro bem-sucedido (TDD §1.5 — vínculo Telegram). */
export interface RegisterSuccessBody {
  /** Texto pronto para colar no bot, ex.: `/start abc...` */
  telegramStartText: string;
  /** O que fazer com o texto (copiar e enviar ao bot). */
  telegramExplanation: string;
  /** TTL do token em segundos (900 = 15 min). */
  expiresInSeconds: number;
}
