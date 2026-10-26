# MapScrape REST API v1

## Base URL

Use a URL de produção configurada para o serviço. Em desenvolvimento, use a origem do servidor local. Não codifique uma URL de produção presumida: defina `MAPSCRAPE_API_BASE_URL` no projeto consumidor.

Todas as rotas v1, exceto `GET /api/v1/health`, exigem:

```http
Authorization: Bearer <MAPSCRAPE_API_KEY>
Accept: application/json
```

No servidor MapScrape, configure `MAPSCRAPE_API_KEYS` como uma lista separada por vírgulas de segredos fortes, cada um com pelo menos 32 caracteres. Exemplo de geração local: `openssl rand -hex 32`. Configure o valor no gerenciador de secrets do ambiente de deploy. Nunca coloque a chave em código frontend, query string, logs ou repositório.

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
- `503 api_not_configured`: `MAPSCRAPE_API_KEYS` não foi configurada no servidor; ou dependência indisponível no endpoint de saúde.

A versão atual não implementa ainda limites de consumo por cliente, cadastro individual/revogação de chaves por consumidor, nem endpoint dedicado para consulta de reviews/mídias: esses dados vêm dentro do registro completo. Não trate tais capacidades como existentes.

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
