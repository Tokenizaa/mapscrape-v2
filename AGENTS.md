# Instruções permanentes para agentes — MapScrape v2

## Identidade do produto

Este repositório é o serviço central MapScrape, cujo contrato público é a API REST v1. O objetivo do produto é permitir que múltiplas aplicações independentes consumam a capacidade de coleta via HTTP/HTTPS, sem clonar o MapScrape, instalar seu scraper ou manter implementações duplicadas.

Arquitetura esperada:

Google Maps → serviço MapScrape → API REST v1 → múltiplos projetos consumidores

## Regras obrigatórias

1. **Trabalhe no serviço MapScrape.** Não investigue nem modifique projetos consumidores, a menos que o usuário solicite explicitamente outra tarefa.
2. **API-first:** mudanças na capacidade de coleta devem ser expostas por endpoints documentados e testados quando forem necessárias aos consumidores. Não exija importação de módulos internos ou acesso direto ao banco por clientes.
3. **Não recomende clonar MapScrape para consumidores.** Consumidores precisam apenas da URL-base implantada e de uma chave individual no backend. O consumidor não instala Puppeteer, não executa o scraper e não conecta diretamente ao banco central.
4. **Contrato único:** mantenha código, docs/API.md, docs/openapi.yaml, README.md e exemplos de integração consistentes. Atualize a documentação quando alterar rotas, schemas, autenticação, erros ou fluxo de jobs.
5. **Isolamento obrigatório:** credenciais individuais devem identificar o consumidor e restringir leads, jobs, resultados, detalhes e operações relacionadas aos dados daquele consumidor. Não confie somente na autenticação; valide também a propriedade dos recursos.
6. **Segredos:** nunca comite, imprima ou exponha MAPSCRAPE_API_KEY, MAPSCRAPE_PROVISIONING_TOKEN, tokens de provedores ou credenciais de banco. A chave bootstrap é administrativa e deve ficar em secrets autorizados. Não coloque chaves no frontend.
7. **Provisionamento simples e seguro:** a emissão de credenciais deve ocorrer pelo fluxo oficial e seguro do serviço central/infraestrutura. Não oriente um agente consumidor a clonar este repositório para provisionar uma chave. Se faltar autorização, informe exatamente qual secret/permissão operacional está ausente.
8. **Não invente disponibilidade:** distinguir código local, testes automatizados, CI e produção. Build verde ou health check não comprovam raspagem funcional. Validar execução de navegador, persistência e leitura dos resultados quando houver ambiente/credenciais autorizados.
9. **Sem mudanças remotas arriscadas sem autorização:** não executar deploy, raspagem em massa, escritas de produção, migrações destrutivas ou alterações de credenciais sem autorização explícita.
10. **Preservação:** antes de modificar o banco ou arquivos existentes, inspecione o estado do Git e preserve as alterações locais. Nunca usar comandos destrutivos de Git para forçar sincronização.
11. **Execução completa:** quando solicitado a corrigir, implemente a correção segura, rode os testes relevantes, lint e build, repita os testes após alterações e informe os resultados reais. Não pare apenas em auditoria ou plano.
12. **Relato honesto:** listar commits, arquivos alterados, verificações executadas, falhas restantes e bloqueios externos. Não dizer que CI passou enquanto estiver em execução nem que produção foi corrigida sem deploy e teste efetivos.

## Contrato central da API

Consulte antes de alterar:
- docs/API.md — contrato REST e autenticação;
- docs/openapi.yaml — esquema OpenAPI;
- docs/INTEGRATION-FOR-LLMS.md — prompt para agentes que trabalham nos projetos consumidores.

Endpoints principais: health, listagem/detalhe de leads, criação/status/resultados de jobs e provisionamento de credenciais. Mudanças devem preservar compatibilidade ou documentar explicitamente qualquer quebra.

## Critério de sucesso

Um projeto novo deve poder consumir a API com configuração server-side de URL e chave, solicitar/acompanhar uma coleta e recuperar seus resultados sem clonar o MapScrape nem instalar o scraper. O serviço central permanece responsável pela coleta, autenticação, isolamento, persistência e contrato.
