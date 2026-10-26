# Relatórios de execução

O servidor gera automaticamente dois artefatos após cada pesquisa:

- `latest-audit.json`: relatório da última execução finalizada.
- `<jobId>.json`: relatório imutável identificado pelo ID da execução.

Os relatórios contêm contagem da base antes/depois, crescimento líquido, registros salvos pela execução, fichas duplicadas identificadas, eventos técnicos, erros e campos ausentes.

Para baixar o relatório pela API, use `GET /api/reports/<jobId>`. O `latest-audit.json` fica no diretório de trabalho do servidor e pode ser incluído no Git quando você quiser compartilhar a evidência. Confira os dados antes de publicar, pois podem conter nomes, telefones, endereços e links de fichas.
