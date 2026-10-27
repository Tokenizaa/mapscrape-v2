# Validação de Cobertura Firecrawl × MapScrape — 27/10/2026

## Objetivo e regra de aprovação

Este documento reconcilia os campos descritos em `docs/mapeamento-verificado-firecrawl-bearzil.md` e `docs/matriz-cobertura-firecrawl-implantacao.md` com o código atualmente em `main`.

**Regra:** um campo vazio NÃO significa que o dado não existe no Google Maps. Sem evidência observada da página e rastreamento da coleta, o único resultado correto é “não capturado / causa ainda não comprovada”. Não atribuir “indisponível na fonte” somente porque a coluna está vazia.

## Correções de código feitas nesta rodada

- `d776df13da8a8ab6c6daa6041e0cb001261a557b`: corrigido escaping de regex na detecção de links de agendamento. A versão anterior usava `\\s` e `\\b` em regex literals, fazendo-os procurar barras invertidas literais em vez de whitespace/limites de palavra.
- `d8cfe34afe568a4501842493218d37cd2698a3a8`: corrigido o split do `srcset` para separar candidato de URL e descritor de largura corretamente.

Esses commits corrigem defeitos reais, mas **não equivalem a aprovação verde**: ainda é necessária execução automatizada e coleta visual real após deployment.

## Matriz honesta de implementação

| Campo documentado | Implementação encontrada em `main` | Conclusão atual |
|---|---|---|
| `name`, `category`, `address`, `phone`, `website` | Campos no tipo, extração no `extractor.ts`, persistência no `db.ts` | Implementação presente; sem execução real recente não aprovar a exatidão |
| `rating`, `review_count` | Extração e normalização presentes | Implementação presente; valor precisa ser comparado à ficha observada |
| `latitude`, `longitude`, `maps_url`, `plus_code` | Coordenadas derivadas da URL e Plus Code por atributos DOM; colunas existentes | Implementação presente; não comprova captura em toda variação de interface |
| `business_status` | Extração por labels e classes da ficha | Implementação presente; precisa validar idiomas/layouts |
| `price_range` | Seletores presentes; documentação Firecrawl informa que preço não apareceu na sessão limitada | Campo vazio não permite distinguir limite da sessão de falha de seletor |
| `opening_hours` | Tenta expandir botão e ler linhas/elementos de horário | Parcial: se a expansão falhar ou o DOM mudar, pode ficar vazio; não marcar como indisponível sem evidência da sessão |
| `popular_times` | Não há campo nem extração dedicada no `PlaceRecord`/`extractor.ts` atual | Lacuna real de implementação |
| `booking_url` | Tipo, banco e extrator existem; detecção de rótulos corrigida nesta rodada | Implementado, mas ainda sem validação real pós-correção |
| `photos` / `media_items` | Captura DOM, lazy loading e scroll de galeria; URLs e itens estruturados persistidos | Parcial: o total observado (ex. 187) não é comparado com o total capturado; não garantir completude |
| `thumbnail_url` | Campo gerado para `media_items`; URL original é mantida quando não transformável | Parcial: URL diferente não garante que a miniatura exista ou carregue; validar HTTP/UI |
| `videos` | Seletores e coleta presentes | Parcial: pode capturar URL ou label de vídeo; validar que os resultados são mídia reproduzível |
| `logo_url` | Detecta imagens com rótulos de perfil/logo | Parcial: heurística conservadora; vazio significa “não identificada pelo extrator”, não prova de inexistência |
| `social_links` | Coleta links sociais explícitos no DOM da página | Implementado; sem comprovação de que todos os links estão expostos |
| `reviews` | Abre painel, tenta expandir e rolar; persiste JSON | Parcial: quantidade visível depende da interface e do acesso permitido; não prometer coletar todas as avaliações |
| `review_highlights` | Não há campo dedicado; alguns textos podem existir dentro de `reviews` | Lacuna de modelagem: os destaques Firecrawl não são garantidos no resultado |
| `review_topics` / contagens | Coleta chips/contagens explícitas e persiste JSON | Parcial: seletor pode perder chips ou contagens; validar contra evidência Firecrawl |
| `additional_attributes` / acessibilidade | Coleta texto e seções da aba Sobre em JSON genérico | Parcial: conteúdo existe em estrutura genérica, não em campos normalizados de acessibilidade |
| `rating_distribution` | Ausente do tipo, banco e extrator | Lacuna real de implementação |
| `postal_code`, `country`, `city`, `state`, `source_url`, `source_place_id` | Não existem como campos dedicados no `PlaceRecord` atual; endereço/URL podem conter parte da informação | Lacuna de modelagem; não considerar esses campos implementados |
| Rótulos de interface (`ui_controls`) | Não persistidos como dados de negócio | Correto não os tratar como atributos comerciais; só implementar se houver requisito explícito |
| `collected_at` | Definido no extrator e persistido | Implementação presente |

## Evidência Firecrawl e limites

O documento de 26/10/2026 registra para a Bearzil: rating 4.9, 278 avaliações, 187 fotos visíveis, três avaliações completas, tópicos e atributos; também registra que a sessão estava em “limited view”. Essa evidência é recente, mas descreve aquela sessão, não todas as sessões atuais do scraper.

- Horário semanal e popular times: não observados na sessão Firecrawl descrita; isso não prova indisponibilidade universal.
- Logo separado e miniaturas: não extraídos pelo Firecrawl; o código tem heurísticas, mas não há prova de captura.
- Distribuição por estrelas: não estruturada no schema atual.
- Avaliações: três visíveis naquela sessão, não as 278 completas.

## Critérios para selo verde

Só aprovar quando todos os itens abaixo forem comprovados:

1. `npm test`, `npm run lint` e `npm run build` passam no commit atual.
2. Coleta real da Bearzil e da Barbearia Retrô em browser, sem criar registros artificialmente no banco.
3. Para cada campo, evidência da página e resultado coletado, persistido e devolvido pela API comparados.
4. A ficha visual e exportação apresentam os campos persistidos corretamente.
5. Cada ausência recebe um status verificável: `captured`, `not_visible_in_session`, `selector_miss`, `persistence_error` ou `not_implemented`; nunca inferir “não existe” de string vazia.
6. Deployment de produção concluído com sucesso e reteste na URL pública.

## Status desta revisão

**AMARELO — correções pontuais aplicadas; aprovação verde ainda não demonstrada.** Não foi possível afirmar que os testes automatizados, a coleta real, a persistência visual e o deployment passaram apenas com a inspeção de código e os commits.
