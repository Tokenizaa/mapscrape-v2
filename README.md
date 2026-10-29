# MapScrape v2

## Cadastro e acesso à plataforma

A interface nativa usa contas individuais com cadastro e login por e-mail e senha. Cada conta recebe um espaço de trabalho isolado e não precisa de chave de consumidor. As credenciais de API continuam exclusivas para sistemas externos.

Configure no ambiente **Production** da Vercel:
- `MAPSCRAPE_SESSION_SECRET`: segredo aleatório forte, exclusivo para assinar sessões.
- `MAPSCRAPE_ADMIN_EMAIL`: e-mail da conta administradora inicial (padrão: `olfnetto@gmail.com`).
- Opcionalmente, `MAPSCRAPE_ADMIN_PASSWORD`: permite bootstrap server-side alternativo, sem expor senha no frontend.

Enquanto o banco não tiver contas, somente o e-mail administrador configurado pode criar a primeira conta; cadastros sem essa autorização são recusados. Após a criação da primeira conta, os novos cadastros recebem papel de usuário. Nunca coloque segredos nos arquivos do repositório, no bundle público, em URLs ou logs. Alterações nas variáveis de ambiente exigem novo deployment automático pelo Git Integration para entrarem em vigor.

Endpoints de conta: `POST /api/auth/register`, `POST /api/auth/login` e `GET /api/auth/me`. Sessões expiram em 12 horas. Login e cadastro têm limite de tentativas.

## Uso normal versus integração externa

A interface nativa deve permitir criar projetos, definir categorias, executar pesquisas e consultar resultados sem pedir uma chave de consumidor. A chave individual é para um sistema externo que integra com a REST API. Para emiti-la, abra **Integrações → Credenciais de API**, informe **Nome do cliente** e **Nome do projeto**, clique em **Gerar chave** e copie o segredo uma única vez para o secret manager do cliente. A emissão e revogação devem permanecer protegidas por autenticação administrativa real; não exponha `MAPSCRAPE_PROVISIONING_TOKEN` nem crie um proxy público sem autenticação.

**MapScrape é um serviço central de raspagem acessado por API.** Aplicações consumidoras integram-se por HTTPS e não devem clonar este repositório, instalar Puppeteer ou manter um scraper paralelo. Este repositório contém o serviço que executa as coletas, persiste os dados e disponibiliza os resultados autenticados.

## Como outros projetos devem usar o MapScrape

A arquitetura esperada é:

`Google Maps → serviço MapScrape → API REST v1 → aplicações consumidoras`

O MapScrape é responsável por executar a coleta, acompanhar jobs e persistir os resultados. Cada aplicação cliente deve apenas fazer requisições HTTP para a URL implantada, usando sua própria credencial no backend.

Para integrar um consumidor, são necessários somente:

- `MAPSCRAPE_API_BASE_URL`: URL-base confirmada do serviço implantado.
- `MAPSCRAPE_API_KEY`: chave individual do consumidor, armazenada como secret server-side.

Não se deve clonar este repositório dentro de aplicações consumidoras, instalar dependências do scraper nelas, importar módulos internos do MapScrape ou acessar diretamente o banco de dados central. O frontend nunca deve receber a chave da API.

### Documentação pública

- [Portal para desenvolvedores e agentes](https://mapscrape-v2.vercel.app/docs/)
- [Referência OpenAPI YAML](https://mapscrape-v2.vercel.app/openapi.yaml)
- [Índice para agentes (llms.txt)](https://mapscrape-v2.vercel.app/llms.txt)
- [Skill de integração para agentes](https://mapscrape-v2.vercel.app/skill.md)

Os arquivos de documentação versionados permanecem neste repositório como fontes de manutenção; o portal público é o ponto de entrada recomendado para consumidores.

## Endpoints principais

Todos os endpoints abaixo, exceto o health check, exigem autenticação.

| Método | Endpoint | Finalidade |
|---|---|---|
| GET | `/api/v1/health` | Verificar serviço e banco |
| GET/POST | `/api/v1/projects` | Listar/criar ou reutilizar projetos |
| GET/POST | `/api/v1/categories` | Listar/criar ou reutilizar categorias de pesquisa |
| GET | `/api/v1/leads` | Pesquisar leads com filtros e paginação |
| GET | `/api/v1/leads/{id}` | Obter detalhes de um lead |
| POST | `/api/v1/jobs` | Iniciar coleta assíncrona |
| GET | `/api/v1/jobs/{id}` | Consultar status e progresso |
| GET | `/api/v1/jobs/{id}/results` | Consultar resultados paginados |
| POST | `/api/v1/provisioning/credentials` | Emitir credencial de consumidor, com token bootstrap |
| GET/DELETE | `/api/v1/provisioning/credentials` | Administrar credenciais |
| POST | `/api/v1/provisioning/credentials/{id}/rotate` | Rotacionar credencial (admin) |

Autenticação de consumidor:

```http
Authorization: Bearer <MAPSCRAPE_API_KEY>
Accept: application/json
```

Veja [docs/API.md](docs/API.md) para os parâmetros, payloads, erros, autenticação e provisionamento completos.

## Credenciais e isolamento

Use credenciais individuais emitidas pelo fluxo de provisionamento. Cada credencial identifica um consumidor estável (`consumerProject`) e as consultas de leads/jobs devem ser limitadas a esse consumidor. As chaves estáticas de `MAPSCRAPE_API_KEYS` existem para compatibilidade/uso operacional e não devem ser compartilhadas entre aplicações que precisam de isolamento entre si.

A chave bootstrap `MAPSCRAPE_PROVISIONING_TOKEN` é administrativa: guarde-a somente em secrets de infraestrutura confiável. Nunca a coloque em código, no frontend ou em conversas. A chave individual completa é exibida uma única vez na emissão; grave-a diretamente no secret manager do consumidor. Nunca registre chaves em logs ou repositórios.

O provisionamento é uma tarefa operacional do serviço central/infraestrutura autorizada. Um agente trabalhando em um projeto consumidor não deve clonar MapScrape apenas para gerar uma chave. Se não houver credencial, solicite que o operador autorizado execute o provisionamento seguro e entregue a credencial diretamente ao secret manager do consumidor.

## Desenvolvimento deste repositório

Estas instruções destinam-se somente a quem desenvolve o próprio serviço MapScrape, não às aplicações consumidoras.

Stack atual: Express, TypeScript, Vite/React, Puppeteer e LibSQL/Turso. Em desenvolvimento, use a configuração de banco e navegador apropriada ao ambiente. Em produção, o banco remoto usa `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN`; a coleta depende também da configuração de navegador remoto exigida pela implantação.

Comandos de validação:

```bash
npm test
npm run lint
npm run build
```

Não declare a API funcional em produção apenas porque o build passou ou `/api/v1/health` respondeu. Valide autenticação, criação de job, execução do navegador, persistência, consulta de status e recuperação dos resultados. Não execute coletas reais nem escritas remotas sem autorização.

## Limites de extração

A API retorna os dados efetivamente coletados e persistidos. A disponibilidade de telefone, site, avaliações, fotos, vídeos, atributos e outros campos depende do conteúdo exposto na ficha e do resultado de cada coleta. Um campo vazio significa ausência de valor persistido, não que o negócio não possua essa informação. O health check não comprova, isoladamente, que o navegador de raspagem está operacional.
