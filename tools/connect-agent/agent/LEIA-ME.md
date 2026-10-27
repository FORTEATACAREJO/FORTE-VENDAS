# FORTE Connect — espelhamento local, versão 1

Dois destinos independentes:
- FISCAL_XML: Connect Fiscal local → Forte Fiscal, somente matriz 49.832.961/0001-51.
- VENDAS: Connect Vendas local → Forte Vendas, conjunto matriz/filial, preservando o código de empresa de origem.

O agente não altera o Connect, não emite notas, não cancela notas, não recompõe estoque operacional e não gera financeiro. Não envia documentos aos clientes. Faz cópias para uma área própria de conferência dos sistemas Forte. O computador precisa estar ligado e o usuário conectado para capturar/enviar. A falta de internet preserva os arquivos na fila local; a fonte permanece intacta.

## Instalação no Windows

1. Instale Python 3.11 ou superior, caso ainda não exista. O pacote usa somente a biblioteca padrão.
2. Extraia o pacote em pasta permanente, fora da pasta de XML/CSV monitorada.
3. Entre como Master no sistema Forte. No Fiscal: Matriz → Parametrização → ESPELHO CONNECT. No Vendas: Início → ESPELHO CONNECT.
4. Baixe uma configuração exclusiva para cada computador e destino. Não reutilize a mesma credencial em computadores diferentes. Válida por 90 dias; pode ser revogada no mesmo painel.
5. Execute CONFIGURAR.cmd. Escolha o JSON baixado e APENAS a pasta em que o Connect guarda/exporta os documentos correspondentes.
6. Execute INICIAR_FISCAL.cmd ou INICIAR_VENDAS.cmd. O programa verifica a pasta a cada 60 segundos.
7. Opcional: execute INSTALAR_INICIO_AUTOMATICO.ps1 com o mesmo usuário Windows. Escolha fiscal_xml ou vendas. A tarefa inicia no login; não exige usuário administrador. Não mova a pasta do agente após cadastrar a tarefa.
8. Para remover o início automático: exclua a tarefa ForteConnect-fiscal_xml ou ForteConnect-vendas no Agendador de Tarefas. Para revogar o envio: use REVOGAR no painel Forte.

A credencial fica protegida por DPAPI, vinculada ao usuário Windows. A configuração baixada inicialmente ainda contém a credencial: guarde-a com acesso restrito. Não envie senha do Connect, A1 ou CSC. Não abra portas no roteador. O agente só faz conexões HTTPS de saída aos dois destinos fixos dos sistemas Forte. Não segue redirecionamentos com a credencial.

## Fiscal — pasta de XML

Arquivos aceitos: nfeProc completo (NF-e modelo 55 ou NFC-e modelo 65, ambiente de produção, protocolo 100/150) e procEventoNFe completo (cancelamento/CC-e com retorno aceito). Notas destinadas à matriz e emitidas pela matriz são identificadas separadamente. Resumos, XML sem protocolo e DANFE/PDF não bastam.

Inclua as pastas de notas autorizadas e eventos, não só PDFs. É possível editar `folders` na configuração local para incluir mais de uma pasta. Subpastas são lidas recursivamente, sem modificar os arquivos.

Os eventos do próprio emitente podem chegar antes da nota; serão vinculados por chave. Eventos de fornecedor aguardam o XML de entrada correspondente: ficam na fila para nova tentativa. Um arquivo desaparecido não significa cancelamento. Cópias conflitantes ficam sinalizadas no painel. O espelho lê a autorização informada no XML; não valida assinatura digital nem consulta a situação atual na SEFAZ. Não é uma nova autorização fiscal.

Não gera automaticamente retorno físico ao estoque: será necessária a evidência de movimentação/posição do sistema original para essa conciliação. Cancelar a nota não prova que houve retorno físico de mercadoria.

## Vendas — exportação CSV

Esta versão lê CSV; NÃO se conecta diretamente a um banco Connect ainda não identificado. Não transforma XML fiscal em venda gerencial automaticamente.

É necessário localizar a opção de exportação do Connect e conferir um CSV real. Se o Connect só exporta manualmente, a leitura fica automática a partir da pasta, mas a exportação ainda será manual. Para capturar diretamente o banco, será necessário identificar banco, versão, tabelas e acesso somente leitura ou cópia de backup.

No JSON em `%LOCALAPPDATA%\ForteConnect\vendas.json`, ajuste:
- `sales.columns`: os nomes EXATOS das colunas exportadas (há um exemplo no pacote).
- `delimiter`: `;`, `,` ou separador real; `encoding`: por exemplo utf-8-sig ou cp1252.
- `decimal`: `,` para 1.234,56; `.` para 1234.56.
- `statuses`: situação original → ABERTA / CONCLUIDA / CANCELADA / DEVOLVIDA. Estados desconhecidos bloqueiam o arquivo.
- Datas: preferencialmente ISO com fuso (2026-10-27T09:00:00-03:00). Para outro formato, configure `datetime_format`, como `%d/%m/%Y %H:%M:%S`, e `timezone_offset` como `-03:00`. Não use data de modificação do arquivo como data de alteração da venda.

Cada venda deve aparecer COMPLETA, com todos os itens, data/hora da alteração na origem, cliente e total. O número do item deve ser estável e não repetido. Todos os itens da mesma venda devem ter o mesmo cabeçalho. Uma exportação com duas versões da mesma venda no mesmo arquivo deve ser separada em snapshots completos.

A empresa de origem compõe a identidade com o sistema e o número da venda. Se o Connect usa uma única base comercial, use seu identificador estável para o conjunto; não invente uma divisão por CNPJ. Não renomeie esse identificador entre exportações.

Cancelamentos/devoluções precisam constar explicitamente na exportação com nova data de atualização. Vendas ausentes de uma exportação NÃO são apagadas ou canceladas. Uma versão antiga que chegar depois de um cancelamento não reabre a venda. Versões com a mesma data e conteúdo diferente geram divergência.

O arquivo vendas-exemplo.csv contém apenas dados fictícios para conferir o mapeamento. Não o coloque na pasta monitorada de dados reais.

## Conferência e falhas

Dados locais em `%LOCALAPPDATA%\ForteConnect`: configuração, fila SQLite por dispositivo e agente.log. A fila mantém cópias pendentes; após confirmação, remove o conteúdo da fila e mantém o hash para não reenviar. Não exclua a fila durante um envio sem confirmação.

HTTP 401/403: conferir validade/revogação do dispositivo e acesso Master do responsável. HTTP 409: evento de fornecedor aguarda nota de entrada. Outros erros: fila tenta novamente, com espera progressiva. Erros de coluna/formato ficam no log e bloqueiam o arquivo; corrigir a exportação e tentar novamente. O programa não ignora silenciosamente linhas inválidas.

A primeira validação deve usar uma venda/nota conhecida, depois o cancelamento correspondente e a conferência dos itens/quantidades. A instalação no computador e essa validação real ainda precisam ser executadas; testes automatizados não comprovam captura do Connect.
