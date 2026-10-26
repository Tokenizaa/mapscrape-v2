# MapScrape

MapScrape coleta e persiste informações publicamente exibidas nas fichas do Google Maps, incluindo dados comerciais, avaliações, tópicos, atributos e mídias quando disponíveis na página.

## API para outros projetos

- [Contrato da API REST v1](docs/API.md)
- [Prompt de integração para LLMs](docs/INTEGRATION-FOR-LLMS.md)
- [Como criar a tela de leads com cards e modal completo](docs/EMBED-LEADS-UI.md)
- [OpenAPI](docs/openapi.yaml)
- [Provisionamento automatizado de consumidores](docs/API.md#provisionamento-automatizado-de-consumidores)
- Instalador: `scripts/provision-consumer.mjs` (Vercel e Cloudflare Workers)

A API v1 é implementada em `server.ts`. Para compatibilidade, `MAPSCRAPE_API_KEYS` continua aceitando chaves estáticas; para novas integrações, use credenciais individuais emitidas pelo provisionador, armazenadas como hash e revogáveis. Configure `MAPSCRAPE_PROVISIONING_TOKEN` como secret de infraestrutura e use `scripts/provision-consumer.mjs` para gravar a chave diretamente em Vercel ou Cloudflare sem expô-la ao chat ou ao código.

## Endpoints principais

- `GET /api/v1/health` — saúde do serviço e conexão com o banco.
- `GET /api/v1/leads` — pesquisa e paginação de leads.
- `GET /api/v1/leads/{id}` — todos os dados persistidos de um lead.
- `POST /api/v1/jobs` — inicia uma coleta.
- `GET /api/v1/jobs/{id}` — acompanha status e progresso.
- `GET /api/v1/jobs/{id}/results` — resultados da coleta, paginados.
- `POST /api/v1/provisioning/credentials` — emite credencial individual (bootstrap token).
- `GET /api/v1/provisioning/credentials` e `DELETE /api/v1/provisioning/credentials/{id}` — administra/revoga credenciais.

A API v1 requer `Authorization: Bearer <API_KEY>`, exceto o endpoint de saúde. Os endpoints legados permanecem para compatibilidade com a interface existente.

## Desenvolvimento e validação

Use os scripts definidos em `package.json`:

```bash
npm test
npm run lint
npm run build
```

Para desenvolvimento local, configure as variáveis de ambiente exigidas pelo banco e pelo navegador conforme o ambiente atual. Em produção, o banco remoto usa `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN`; a coleta também depende da configuração de navegador remoto já utilizada pelo projeto.

## Limitações importantes

A API expõe os dados realmente coletados e persistidos. Não garante que o Google Maps disponibilize todos os campos para toda ficha, nem que todos os comentários, fotos ou vídeos sejam acessíveis em uma execução. Ausência de informação não significa valor zero. O endpoint de saúde não comprova por si só que o navegador de raspagem está disponível.
