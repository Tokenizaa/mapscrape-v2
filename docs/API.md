# MapScrape REST API v1

## Objetivo e uso sem clonagem

O MapScrape é o serviço central de coleta. Projetos consumidores integram-se por HTTP/HTTPS usando a URL-base implantada e uma chave própria; não precisam clonar este repositório, instalar Puppeteer nem executar outro scraper. A coleta e a persistência são executadas pelo MapScrape. Configure apenas `MAPSCRAPE_API_BASE_URL` e `MAPSCRAPE_API_KEY` no backend de cada consumidor, depois de provisionar a credencial.

Credenciais individuais isolam os trabalhos e leads pelo identificador `consumerProject`: um consumidor só pode consultar os trabalhos e leads criados pela própria credencial/projeto. Chaves estáticas configuradas em `MAPSCRAPE_API_KEYS` continuam disponíveis para compatibilidade, mas compartilham a identidade `operator-static-key`; não as use para separar consumidores independentes em produção.

## Base URL

Use a URL de produção configurada para o serviço. Em desenvolvimento, use a origem do servidor local. Não codifique uma URL de produção presumida: defina `MAPSCRAPE_API_BASE_URL` no projeto consumidor.

Todas as rotas v1, exceto `GET /api/v1/health`, exigem:

```http
Authorization: Bearer <MAPSCRAPE_API_KEY>
Accept: application/json
```

A API aceita chaves legadas em `MAPSCRAPE_API_KEYS` e credenciais individuais emitidas pelo provisionador. Credenciais individuais são armazenadas no banco somente como hash SHA-256 e podem ser revogadas; a chave completa é exibida uma única vez na resposta de emissão.

Nunca coloque chaves em código frontend, query string, logs ou repositório.

## Provisionamento automatizado de consumidores

O endpoint de provisionamento usa uma credencial bootstrap separada: `MAPSCRAPE_PROVISIONING_TOKEN`. Ela deve existir apenas em secrets de infraestrutura/CI autorizados, nunca no navegador nem no repositório. Essa autorização inicial é configurada uma vez por organização/ambiente confiável; depois, cada projeto recebe sua própria `MAPSCRAPE_API_KEY`.

- `POST /api/v1/provisioning/credentials` — emite uma credencial individual. Cabeçalho `X-MapScrape-Provisioning-Token`; JSON `{ "consumerName": "Nome do produto", "consumerProject": "org/repo-ou-id-estavel" }`. Retorna `201` com `credentialId` e `apiKey` uma única vez. Repetir para um projeto com credencial ativa retorna `409`.
- `GET /api/v1/provisioning/credentials` — lista metadados sem revelar chaves.
- `DELETE /api/v1/provisioning/credentials/{credentialId}` — revoga a credencial imediatamente.
- `POST /api/v1/provisioning/credentials/{credentialId}/rotate` — revoga a chave ativa anterior e emite uma substituta; retorna a nova `apiKey` uma única vez. A chave anterior deixa de autenticar imediatamente. Se a emissão da substituta falhar, a anterior permanece revogada e uma nova emissão deve ser feita.
- `scripts/provision-consumer.mjs` — emite a chave, grava-a diretamente em Vercel Production ou Cloudflare Worker Secret e valida uma chamada de leitura. Não imprime nem salva a chave em arquivo.

O provisionamento deve ser executado pelo operador/infraestrutura autorizada que controla o serviço central e os secrets do projeto de destino. O repositório consumidor não precisa clonar MapScrape nem executar seu instalador: recebe somente `MAPSCRAPE_API_BASE_URL` e a chave individual `MAPSCRAPE_API_KEY`, gravada como secret server-side. Quando a automação de provisionamento for executada por infraestrutura autorizada, ela pode usar `MAPSCRAPE_BASE_URL`, `MAPSCRAPE_PROVISIONING_TOKEN`, `CONSUMER_NAME`, `CONSUMER_PROJECT` e `TARGET_PROVIDER`; para Vercel, `VERCEL_TOKEN`, `VERCEL_PROJECT_ID` e opcionalmente `VERCEL_TEAM_ID`; para Cloudflare, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` e `CLOUDFLARE_WORKER_NAME`.

A chave bootstrap continua sendo uma autorização administrativa compartilhada: distribua-a somente como secret de organização/CI para agentes confiáveis. O instalador não elimina a necessidade dessa autorização inicial.

## Endpoints

### GET /api/v1/health

Não requer chave. Retorna status do serviço, estado da conexão com o banco, quantidade de leads e timestamp. Não verifica a conexão com o navegador de raspagem.

Resposta de sucesso: `200`.

### GET /api/v1/leads

Requer autenticação.

Parâmetros:
- `query`: busca textual nos campos nome, categoria, endereço, telefone e website.
- `jobId`: restringe os resultados à coleta indicada.
- `sortBy`: `name`, `category`, `rating`, `review_count` ou `collected_at`.
- `sortOrder`: `asc` ou `desc`.
- `limit`: inteiro de 1 a 100; padrão 50.
- `offset`: inteiro >= 0; padrão 0.

Resposta:

```json
{
  "data": [
    {
      "id": "identificador-persistido",
      "job_id": "identificador-da-coleta",
      "name": "Nome conforme a ficha",
      "category": "Categoria observada",
      "address": "Endereço observado",
      "phone": "",
      "website": "",
      "rating": "",
      "review_count": "",
      "price_range": "",
      "opening_hours": "",
      "business_status": "",
      "latitude": "",
      "longitude": "",
      "maps_url": "https://www.google.com/maps/...",
      "description": "",
      "services_attributes": {},
      "photos": [],
      "videos": [],
      "logo_url": "",
      "booking_url": "",
      "social_links": [],
      "reviews": [],
      "review_topics": [],
      "additional_attributes": {},
      "media_items": [],
      "plus_code": "",
      "collected_at": "timestamp persistido"
    }
  ],
  "pagination": {
    "total": 1,
    "limit": 50,
    "offset": 0,
    "hasMore": false
  }
}
```

O exemplo é ilustrativo, não um registro real. Valores vazios significam que o campo não contém valor persistido; não devem ser interpretados como uma afirmação de que o negócio não possui esse dado. Campos estruturados são normalizados pela API: `photos`, `videos` e `social_links` são arrays; `reviews`, `review_topics`, `additional_attributes`, `media_items` e `services_attributes` são convertidos de JSON quando válido, preservando como texto o conteúdo que não seja JSON válido.

### GET /api/v1/leads/{id}

Requer autenticação. Retorna o registro completo sob `data`, incluindo os arrays e objetos estruturados acima. Retorna `404` quando o ID não existe.

### POST /api/v1/jobs

Requer autenticação. Inicia uma coleta assíncrona.

Request:

```json
{ "segment": "barbearia", "location": "Itaim Bibi, São Paulo, SP", "limit": 20 }
```

- `segment`: string obrigatória.
- `location`: string obrigatória.
- `limit`: inteiro de 1 a 100; padrão 20.

Resposta `202`:

```json
{
  "data": {
    "jobId": "job_...",
    "status": "running",
    "statusUrl": "/api/v1/jobs/job_...",
    "resultsUrl": "/api/v1/jobs/job_.../results"
  }
}
```

Guarde o `jobId`; não mantenha a requisição aberta aguardando a coleta. O consumidor deve consultar o status separadamente.

### GET /api/v1/jobs/{id}

Requer autenticação. Retorna os campos do trabalho, status, contadores, mensagem e `isRunning`. Estados de trabalho seguem os tipos usados pelo aplicativo, incluindo `running`, `completed`, `partial`, `stopped` e `failed`.

### GET /api/v1/jobs/{id}/results

Requer autenticação. Retorna os leads persistidos para uma coleta, com a mesma forma de dados e paginação de `GET /api/v1/leads`. Parâmetros `limit` (1–100, padrão 50) e `offset` (>=0, padrão 0).

## Erros

- `401 unauthorized`: chave ausente ou inválida.
- `404 lead_not_found` / `job_not_found`: ID inexistente.
- `422 invalid_request`, `invalid_limit` ou `invalid_pagination`: parâmetros inválidos.
- `500`: falha ao consultar ou iniciar a operação.
- `503`: indisponibilidade do banco ou falha na consulta de credenciais. O endpoint de saúde pode retornar `503` quando o banco estiver indisponível.

A versão atual oferece cadastro/revogação de credenciais individuais e trilha de auditoria da emissão/revogação. Ainda não há quotas de consumo por consumidor nem endpoint dedicado para reviews/mídias: esses dados vêm dentro do registro completo. Não trate quotas por consumidor como existentes.

## Exemplo cURL

```bash
export MAPSCRAPE_API_BASE_URL="https://URL-REAL-DO-SERVICO"
export MAPSCRAPE_API_KEY="segredo-fornecido-pelo-operador"
curl -fsS "$MAPSCRAPE_API_BASE_URL/api/v1/leads?query=barbearia&limit=20&offset=0" \
  -H "Authorization: Bearer $MAPSCRAPE_API_KEY" \
  -H "Accept: application/json"
```

Substitua a URL e a chave pelos valores reais provisionados para o ambiente. Não reutilize esse exemplo literal em produção.

## Persistência e qualidade

A API lê os registros persistidos pelo MapScrape e não promete disponibilidade integral de todos os dados públicos. A extração de avaliações, tópicos, atributos e mídias depende do conteúdo que a página expõe e da execução de coleta. Verifique `collected_at`, estado da coleta e campos vazios antes de tomar decisões comerciais.
