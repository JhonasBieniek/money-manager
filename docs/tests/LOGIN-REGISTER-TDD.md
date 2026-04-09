# TDD — Cadastro, login e vínculo Telegram

Este documento define o **fluxo de testes** (comportamento esperado) para implementação do cadastro, login e pós-cadastro com bot do Telegram, conforme [`docs/rules/LOGIN-REGISTER.md`](../rules/LOGIN-REGISTER.md).  
Use estes cenários como **especificação executável por ideia**: cada caso deve falhar antes da implementação e passar depois.

---

## Escopo e princípios

- **Cadastro** apenas com **email** e **senha** (sem campos obrigatórios extras na regra).
- **Login** não pode vazar qual campo falhou: mensagens genéricas apenas.
- **Email** validado de forma **simples** (formato), **sem** fluxo de confirmação por código.
- **Limites de caracteres** aplicados **de ponta a ponta** (cliente, API, persistência).
- **Pós-cadastro**: usuário recebe texto copiável `/start ${token}` + explicação; **token expira em 15 minutos**; ao enviar no bot, o **usuário é associado ao `chat_id`**.

---

## Convenções de nomenclatura

| Termo        | Significado                                      |
|-------------|---------------------------------------------------|
| **Sucesso** | HTTP 2xx e regras de negócio atendidas           |
| **Falha**   | HTTP 4xx/5xx conforme contrato + mensagens OK    |

Defina limites máximos únicos do produto (ex.: `EMAIL_MAX`, `SENHA_MAX` / `PASSWORD_MAX`) e **use os mesmos valores** em validação de entrada, modelo/DTO e colunas do banco.

---

## Dados de teste base

- **Email válido**: endereço com formato aceito pela validação “simples” (ex.: contém `@` e domínio mínimo — alinhar à implementação sem exigir confirmação).
- **Senha válida**: dentro do limite de caracteres; política mínima de complexidade **só se o produto definir** (a regra atual não exige — não adicionar requisitos não documentados aqui sem atualizar a regra).

Guardar fixtures: emails únicos por execução de teste para evitar colisão.

---

## 1. Cadastro (`POST` — endpoint a definir)

### 1.1 Deve aceitar apenas email e senha

**Dado** payload JSON com exatamente `email` e `password`  
**Quando** a requisição é enviada com valores válidos e dentro dos limites  
**Então** o usuário é criado (ou equivalente idempotente documentado)  
**E** a resposta **não** exige campos extras além dos dois para concluir o cadastro nesta regra.

### 1.2 Deve rejeitar email com formato inválido (validação simples)

**Dado** email sem formato aceito pela validação simples  
**Quando** cadastro é tentado  
**Então** retorno de erro claro de validação (ex.: 400)  
**E** **não** é disparado fluxo de “código de confirmação” nem envio de email de verificação.

### 1.3 Deve aplicar limite máximo de caracteres em todos os campos

Para cada campo `email`, `password`:

**Dado** valor com tamanho **igual** ao máximo permitido  
**Quando** cadastro  
**Então** sucesso (se demais regras OK).

**Dado** valor com tamanho **maior** que o máximo  
**Quando** cadastro  
**Então** erro de validação (ex.: 400)  
**E** o registro **não** persiste dados truncados silenciosamente.

### 1.4 Deve garantir limite também na camada de persistência

**Dado** tentativa de contornar o cliente e enviar payload acima do limite (via API direta)  
**Quando** a API persiste  
**Então** validação rejeita **antes** de gravar **ou** o banco rejeita com constraint compatível com a API (sem truncar).

### 1.5 Resposta pós-cadastro: instrução Telegram + token temporário

**Dado** cadastro bem-sucedido  
**Então** a resposta inclui:

1. Um texto **pronto para copiar** no formato: `/start ${token}` onde `${token}` é o token gerado.
2. Uma **explicação** objetiva do que fazer (ex.: colar no chat do bot do Telegram).
3. Metadado ou texto informando **validade de 15 minutos** do token (pode ser campo `expiresInSeconds: 900` ou mensagem equivalente — manter consistência na API).

**E** o token:

- É **opaco** (não expõe dados internos previsíveis).
- **Expira** em **15 minutos** após emissão (teste de relógio: avançar tempo em teste ou mock).
- Após expirado, **não** vincula `chat_id` (ver seção 3).

---

## 2. Login (`POST` — endpoint a definir)

### 2.1 Resposta genérica para credenciais incorretas

Para **qualquer** falha de autenticação por email/senha (incluindo email inexistente, senha errada, conta inexistente):

**Quando** login falha  
**Então** o corpo da resposta (e mensagem ao cliente) deve ser equivalente a **“Email/Senha incorreto”** (ou mensagem única acordada, mas **sempre a mesma** para esses casos).

**E** a resposta **não** contém:

- “E-mail inválido” como distinção de “senha errada”.
- “Senha incorreta para este e-mail” ou qualquer frase que revele que o email existe.

### 2.2 Não vazar existência de usuário por timing ou corpo

**Dado** email registrado com senha errada **e** email não registrado  
**Quando** ambos os logins são tentados  
**Então** status HTTP e corpo seguem o **mesmo contrato** (ex.: mesmo status 401/403 — escolher um e documentar)  
**E** mensagem idêntica.

_Recomendação de implementação (teste opcional de observabilidade): tempos de resposta não devem ser um canal óbvio de enumeração; se houver teste, usar margem generosa ou ambiente estável._

### 2.3 Limite de caracteres no login

**Dado** email ou senha acima do limite máximo definido  
**Quando** login  
**Então** erro de validação (400) com mensagem **genérica ou de validação de tamanho**, desde que **não** viole a regra 2.1 para credenciais “normais” dentro do limite.

_(Ajuste fino: para inputs absurdamente longos, prefira 400 de validação; para combinação válida em tamanho porém incorreta, aplicar 2.1.)_

### 2.4 Sucesso de login não retorna segredos indevidos

**Dado** credenciais corretas  
**Quando** login com sucesso  
**Então** a resposta segue o contrato de segurança do produto (ex.: cookie httpOnly, JWT em corpo se aceito) **sem** incluir senha em texto puro **nem** token Telegram de vínculo se isso não for necessário ao cliente.

---

## 3. Vínculo Telegram após `/start ${token}`

Pré-requisito: bot configurado; ambiente de teste com Telegram mockado **ou** conta de teste documentada.

### 3.1 Mensagem exata dispara vínculo

**Dado** usuário cadastrado e token válido ainda não expirado  
**Quando** o usuário envia no chat do bot a mensagem exatamente `/start ${token}` (com token correspondente)  
**Então** o sistema associa o **usuário** ao **`chat_id`** da conversa.

**E** uma segunda tentativa com o **mesmo** token após vínculo bem-sucedido deve se comportar conforme regra de idempotência definida (ex.: mensagem “já vinculado” **sem** trocar de usuário).

### 3.2 Token expirado não vincula

**Dado** token emitido há mais de 15 minutos (ou relógio simulado)  
**Quando** `/start ${token}`  
**Então** **não** atualiza `chat_id`  
**E** resposta do bot coerente (ex.: pedir novo cadastro/fluxo de emissão de token — definir copy mínima nos testes de integração).

### 3.3 Token inválido ou adulterado

**Dado** string aleatória no lugar do token  
**Quando** `/start lixo`  
**Então** **não** associa usuário  
**E** **não** vaza se o token era “quase válido”.

---

## 4. Testes de regressão cruzada (checklist rápido)

- [ ] Cadastro com só `email` e `password`; demais campos opcionais não bloqueiam se existirem no schema interno.
- [ ] Validação de email simples; **zero** envio de email de confirmação.
- [ ] Limites de caracteres: UI → API → DB.
- [ ] Login: uma única mensagem para falha de credenciais.
- [ ] Pós-cadastro: `/start ${token}` + explicação + TTL 15 min.
- [ ] Vínculo `chat_id` só com token válido e não expirado.

---

## 5. Definição de “pronto” (DoD) para esta especificação

- Todos os cenários das seções **1**, **2** e **3** têm **testes automatizados** onde for possível (unitário + integração + e2e opcional para Telegram).
- Contratos de API documentados (códigos HTTP, shape JSON, mensagens).
- Limites de tamanho publicados em um único lugar (constante compartilhada ou equivalente) e refletidos no banco.

---

## 6. Rastreabilidade com a regra de negócio

| Regra em LOGIN-REGISTER.md                         | Seção deste documento |
|---------------------------------------------------|------------------------|
| Cadastro só email e senha                         | 1.1                    |
| Login sem mensagens específicas por campo         | 2.1, 2.2               |
| Email válido simples, sem confirmação             | 1.2                    |
| Limitação de caracteres ponta a ponta           | 1.3, 1.4, 2.3          |
| Texto `/start ${token}`, explicação, 15 min, `chat_id` | 1.5, 3.1, 3.2, 3.3 |
