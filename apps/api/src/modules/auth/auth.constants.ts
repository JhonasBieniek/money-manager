/** Hash bcrypt válido usado quando o email não existe — comparação sempre roda (anti enumeração). */
export const BCRYPT_DUMMY_HASH =
  "$2b$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi";

export const REFRESH_COOKIE_NAME = "refreshToken";

export const ACCESS_TOKEN_TTL_SEC = 900;

export const REFRESH_TOKEN_DAYS = 7;

export const BCRYPT_COST = 12;

/** TTL do token de vínculo Telegram após cadastro (15 min). */
export const TELEGRAM_LINK_EXPIRES_SEC = 900;

export const TELEGRAM_LINK_EXPLANATION =
  "Copie o texto abaixo e envie no chat do bot do Telegram para vincular sua conta a este cadastro.";
