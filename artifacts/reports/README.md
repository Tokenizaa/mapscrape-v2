# Relatórios de execução

O servidor gera automaticamente dois artefatos após cada pesquisa:

- `latest-audit.json` e `latest-audit.pdf`: relatório mais recente em formato legível por máquina e para leitura humana.
- `<jobId>.json` e `<jobId>.pdf`: arquivos da execução identificada pelo ID.

Os relatórios contêm contagem da base antes/depois, crescimento líquido, registros salvos pela execução, fichas duplicadas identificadas, eventos técnicos, erros e campos ausentes.

Para baixar pela interface, abra **Logs e auditoria**, informe o ID da pesquisa e escolha **Baixar JSON** ou **Baixar PDF**. Pela API, use `GET /api/reports/<jobId>` ou `GET /api/reports/<jobId>/pdf`. O `latest-audit.json` fica no diretório de trabalho do servidor e pode ser incluído no Git quando você quiser compartilhar a evidência. Confira os dados antes de publicar, pois podem conter nomes, telefones, endereços e links de fichas.
