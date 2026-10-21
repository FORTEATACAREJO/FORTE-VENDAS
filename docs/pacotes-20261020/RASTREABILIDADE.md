# Incorporação dos quatro pacotes — 20/10/2026

Estado: desenvolvimento e homologação. Nenhuma alteração destes pacotes publicada em produção.

## Fontes lidas

- FORTE_VENDAS_PACOTE_COMPLETO_PARA_WORK_2026-10-20.zip: todos os documentos de requisitos, testes e modelo lógico.
- forte_frete_pacote_work_postar_carga.zip: instruções e evidências; PR 33 é somente o começo da correção.
- forte_frete_modernizacao_work_codex.zip: cadastros, aprovações, vínculos e expedição separados.
- forte_navegacao_5_sistemas_work_codex.zip: retorno contextual e sessão nos cinco sistemas.

## Inventário e diagnóstico antes das alterações

| Requisito | Implementação encontrada | Lacuna | Mudança / teste |
|---|---|---|---|
| Voltar nos cinco sistemas | Vendas: estado `tab`; Frete: função `route`; Fiscal: estado `page`; Externas: estado `view` | Não havia sincronização das telas com `pushState/popstate`. | Histórico interno e proteção de formulários; testes de ida/volta, rascunhos, links profundos e permissão revogada. |
| Financeiro | O endereço Forte Financeiro redireciona ao Vendas com `app=financeiro`; existe ainda a entrada `/financeiro.html` no Vendas. | Redirecionamento descartava contexto. Alterar apenas o antigo `src/main.jsx` do repositório Financeiro não corrigiria a versão ativa. | Preservar parâmetros autorizados e corrigir os dois pontos de entrada ativos. |
| Postar carga | `frete-loads-admin.js`; PR 33 ainda em rascunho | Textos livres; datalist inicial usa só histórico; sobreposição de botão; capacidade sem dados completos no seletor. | Catálogo mestre mínimo, seleção pesquisável e quantidade do pedido separada da expedição. |
| Catálogo de carga | `fc_app_state.estado`: fornecedores, locais, produtos; Frete não tem catálogo paralelo | Evitar replicar cadastros e expor cadastro comercial completo. | Projeção autenticada somente para administração do Frete; sem preços, contatos privados, senhas ou dados bancários. |
| Motorista/veículo/vínculo | `motoristas`, `veiculos_motorista`, `driver_onboarding`, `historico_motoristas_veiculo` | Submissão atual cria veículo já associado e valida motorista junto com veículo. Veículo não tem aprovação própria. | Migração aditiva e aprovação separada, sem liberar automaticamente cadastros antigos. |
| Vendas / Compras / Pallets / Cargas | `OperationSheet`, `OrdersWorkspace`, `PalletsV47`, menus compartilhados | Menus ainda misturam compras e cargas; Pallets usa movimentos locais e não tem fila de NF integrada. | Três painéis de trabalho e um logístico; preservar endpoints/IDs legados. |
| NF de pallets | Gmail tem `gmail_hub_dossiers`, `gmail_hub_sources`, deduplicação e XML estruturado; existe `fc_pallet_movimentos` | Falta classificação de pallets, distribuição integral transacional e contas correntes por NF. | Reaproveitar origem Gmail, fila persistente e integração atômica com conferência humana. |
| PDFs / WhatsApp / integração Frete | Rotinas existentes de pedido, ordem, romaneio, aceite e comprovante | Preservar limites e estados; nunca afirmar entrega com simples aceitação pela API. | Regressões existentes e testes sem mensagens reais. |

## Regras para resolver divergências

- Quantidade pedida ao fornecedor é preservada. Pedido acima da capacidade pode ser encaminhado com aviso e confirmação; não autoriza expedição acima da capacidade. Aceite e carregamento efetivo continuam limitados ao conjunto aprovado.
- Aprovar motorista, aprovar veículo/conjunto, vincular e desvincular são ações independentes. Aprovação não cria vínculo nem aprova outro módulo.
- Não criar outro painel de carga direta nem duplicar cadastros. IDs históricos e projeções continuam compatíveis.
- Os pacotes pedem homologação e revisão antes da publicação. A entrega final deve informar exatamente os PRs, testes, dependências e autorização de implantação necessária.

## Plano de migração e rollback

Mudanças de banco serão aditivas e exercitadas em banco descartável antes de implantação. Não aplicar migrações em produção durante a homologação. Registrar contagens agregadas e conflitos antes da implantação; nunca fundir motoristas por nome/telefone nem recriar caminhões para trocar vínculo. Preservar tabelas e trilhas antigas.

Rollback de interface: voltar ao commit anterior correspondente a cada PR. Rollback de banco: manter novos registros e desativar o novo caminho de escrita; não apagar dados com um `DROP` genérico. Uma reversão com dados reais exige conciliação e auditoria.

## Verificação local em 21/10/2026

- Vendas: `npm run build` concluiu 233 testes, simulações numéricas e build. `npm run test:browser` passou nos fluxos de pedidos, capacidade, edição, comprovantes, menu, histórico e pallets, em larguras mobile e desktop.
- Frete: testes isolados das migrações, aprovações independentes, vínculo explícito, revisão, permissões, catálogo e repetição idempotente; formulários reais de veículo e postagem testados em 390/1280px. Nenhum convite ou mensagem real enviado.
- Fiscal e Venda Externa: builds e navegador com os próprios adaptadores de histórico, editor aninhado, abas, descarte cancelado/aceito e sessão de teste preservada.
- Financeiro: quatro testes do redirecionamento ativo, destino fixo, parâmetros permitidos e recuperação de acesso.
- Gmail: 16 testes existentes do intake preservados; classificação de pallets com XML e PDF testada sem movimentação automática de estoque.
- Pallets: 29/30 mantém parcial; 31/30 bloqueia; integração completa registra estoque e contas correntes atomicamente; erro intermediário reverte tudo; reenvio não duplica; estorno conserva lançamentos originais.
- Validação física em aparelho Android: ainda não executada. Histórico no Chromium não equivale a teste físico.

## Limites da revisão e critérios ainda abertos

- A destinação atual de NF de mercadoria continua integral: agrupa vendas cuja soma corresponde à NF ou incorpora toda a NF ao estoque. O relacionamento N:N parcial por item entre venda, NF e compra, em ambos os sentidos, ainda exige implementação e homologação; não está coberto pelo simples agrupamento de vendas e não deve ser declarado concluído.
- A concorrência de integração e devolução de pallets passou em sessões independentes do PostgreSQL 17 no CI (job pallet-concurrency, 21/10/2026): somente uma integração, uma devolução limitada pelo saldo e repetição idempotente. Os novos vínculos de veículos ainda precisam do ensaio equivalente. PGlite não substitui esse teste de concorrência.
- A importação de PDFs sem quantidade ou identidade fiscal confirmada sempre permanece em conferência humana. Não presumir identidade ou propriedade de pallets.
- Os dois veículos existentes no preflight do Frete precisarão de análise própria antes de novas ofertas. A migração preserva vínculos e viagens antigos, sem aprovação automática.
- Esses itens mantêm a entrega como rascunho de revisão; não implantar os quatro pacotes como concluídos.
