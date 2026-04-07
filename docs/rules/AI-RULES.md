# Essas regras são imutáveis. Qualquer funcionalidade nova deve respeitá-las.

- Nunca acessar banco direto no controller
- Toda lógica vai no service
- Sempre criar teste antes de implementar
- Código deve ser simples e legível
- Sempre questione a segunça da implementação
- O projeto como um todo deve ser conter uma estrutura atomica.

### Arquitetura
A camada de responsabilidades segue estritamente a ordem: Route → Controller → Service → DB (via Drizzle). Nenhuma camada pula outra.
Controllers existem para uma única finalidade: validar o payload de entrada com Zod e chamar o service correspondente. Zero lógica de negócio aqui. Se um controller tem um if de regra de negócio, está errado.
Services contém toda a lógica de negócio. Nunca retornam objetos crus do banco — sempre mapeiam para tipos de domínio definidos em packages/types. São funções puras e stateless, nunca classes com estado de instância.
Toda operação de escrita no banco é envolta em uma transação explícita do Drizzle, mesmo que seja uma única INSERT. Isso garante que, se o Drizzle adicionar side effects futuros (auditoria, triggers), o comportamento seja previsível.
Operações de leitura seguida de escrita (ex: verificar existência antes de criar) usam SELECT ... FOR UPDATE para evitar race conditions em cenário de concorrência.

### Dados
Dinheiro é armazenado exclusivamente como INTEGER em centavos. R$ 129,90 vira 12990. A conversão acontece nas bordas do sistema: ao receber (parse do input → multiplicar por 100 → arredondar) e ao responder (dividir por 100 → formatar). O package packages/utils/money.ts é o único lugar do sistema onde essa conversão existe.
Todos os timestamps são TIMESTAMPTZ no PostgreSQL e trafegam em UTC em toda a aplicação. Formatação para o fuso do usuário é responsabilidade exclusiva do frontend.
Toda entidade tem deleted_at TIMESTAMPTZ NULL. Soft delete é a única forma de exclusão exposta pela API. Hard delete não existe. Todas as queries filtram WHERE deleted_at IS NULL por padrão — isso é responsabilidade do service, nunca do controller.
occurred_at é a data/hora real da transação (vinda do print ou informada pelo usuário). created_at é quando o registro entrou no sistema. São campos distintos com significados distintos e ambos são obrigatórios.

### Identificadores
UUID v7 em todas as entidades. A geração acontece em packages/utils/id.ts e é chamada no service antes de inserir, nunca delegada ao banco. Isso garante que o id seja conhecido antes do insert e possa ser retornado imediatamente.

### Segurança
Senhas são armazenadas com bcrypt, custo mínimo 12. Nunca MD5, nunca SHA, nunca texto plano.
Refresh tokens são gerados como 32 bytes aleatórios (crypto.randomBytes), enviados ao cliente uma única vez, e armazenados no banco como SHA-256 do valor original. Se o banco vazar, os tokens são inúteis. O token é enviado ao cliente em cookie HttpOnly, SameSite=Strict, Secure.
Ao usar um refresh token, o anterior é imediatamente marcado como revoked_at = NOW() e um novo par (access + refresh) é emitido. Se um token revogado for apresentado, todas as sessões do usuário são invalidadas — isso indica possível ataque de replay.
Erros retornados ao cliente são sempre genéricos. Detalhes técnicos só existem nos logs do servidor, nunca na resposta HTTP.

### Bot
TELEGRAM_ALLOWED_CHAT_ID é uma variável de ambiente obrigatória. O bot rejeita silenciosamente qualquer mensagem que não venha desse chat_id. Não há registro de usuário via bot — o bot opera com um API key interno que o identifica como serviço confiável.
O update_id de cada mensagem do Telegram é usado como idempotency_key na tabela expenses. Uma inserção duplicada (webhook entregue duas vezes) é detectada pela unique constraint e silenciosamente ignorada.
O OCR retorna um score de confiança. Acima de 0.80, a despesa é salva automaticamente e o bot confirma. Abaixo de 0.80, o bot exibe o que entendeu e aguarda confirmação do usuário antes de salvar.

### Convenções de código
Arquivos em kebab-case. Funções e variáveis em camelCase. Tipos e interfaces em PascalCase. Tabelas no banco em snake_case. Variáveis de ambiente em SCREAMING_SNAKE_CASE.
Erros de domínio são classes tipadas que estendem AppError (ex: ExpenseNotFoundError, CategoryInUseError). O error handler global do Fastify mapeia cada tipo de erro para o status HTTP correto.
Erros de domínio são classes tipadas que estendem AppError (ex: ExpenseNotFoundError, CategoryInUseError). O error handler global do Fastify mapeia cada tipo de erro para o status HTTP correto.

**Esse documento é o contrato do projeto. Qualquer PR que viole uma dessas regras está errado independente de funcionar — a coerência é o que permite adicionar funcionalidades sem reescrever nada.**