- O usuario deverá poder se cadastrar no sistema apenas com email e senha
- Não retorne dados especificos da autenticação na resposta da request de login, a resposta da request deve ser sempre algo como "Email/Senha incorreto" e nunca "E-mail inválido" ou "Senha incorreta para este e-mail"
- Deverá ser verificado se o email é valido de forma simples, sem código de confirmação.
- Email e senha devem ter limitação de caracteres de ponta a ponta para não permitir valores gigantescos no banco de dados.

- Após o usuario definir email e senha ele deverá receber um texto para copiar, como "/start ${token_gerado_para_o_telegram}" e uma explicação do que fazer com esse texto copiado, esse token irá expirar em 15 minutos
e assim que o usuario enviar no chat do bot deverá atribuir aquele usuario ao seu respectivo chat_id
