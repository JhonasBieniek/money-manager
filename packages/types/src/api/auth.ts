/** Resposta JSON de login bem-sucedido (sem refresh nem segredos). */
export interface LoginSuccessBody {
  accessToken: string;
  tokenType: "Bearer";
  expiresInSeconds: number;
}

/** Resposta JSON de cadastro bem-sucedido (inclui sessão autenticada). */
export interface RegisterSuccessBody extends LoginSuccessBody {
  message: string;
}
