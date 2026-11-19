# Minha Obra — Sistema de Gestão de Obras

Regras do projeto para qualquer agente (Claude Code, Codex) que abrir esta pasta.

## O que é

App React + Vite de gestão de obras (cronograma, orçamento, caixa, diário, medições, qualidade, segurança).
Hoje os dados ficam no navegador (`localStorage`), uma chave por obra: `p6obra:projeto:<id>`, e a lista em `p6obra:lista_projetos`.
O código veio de `Desktop\APP\obra_p6 (7).jsx` (a mesma versão do `Sistema_Gestao_Obras (13).html`).

## Para onde vai

Plano aprovado: levar o app para o Supabase, com várias obras e várias pessoas, cada uma vendo só as obras de que é membro.
Toda tabela de dados de obra leva `obra_id`. Ordem: camada de dados → banco → importação dos dados → login e portfólio → módulos por grupo → teste da segunda obra → Vercel.

## Régua

`npm run check` antes de todo envio. Hoje é só o build. Lint e testes entram junto com a camada de dados (`src/lib/dados.js`).

## Armadilhas

- Em obra existente, módulo que falta no estado salvo cai no `*_SEED` (dados da demonstração). Ao importar dados de versões antigas, módulo ausente vira lista vazia, nunca a demo.
- Dados das obras (cópias `.json`, backups) nunca vão para o Git.
- `.env.local` guarda as chaves e nunca vai para o Git. Conferir com `git ls-files .env.local` (tem que voltar vazio).

## Supervisão por caminho

Diff que toca em `src/lib/supabase.js`, `src/lib/dados.js`, políticas RLS, `supabase/migrations/` ou fluxo de dinheiro (caixa, medições, orçamento) → rodar a revisão de código antes do push (Claude Code: `/code-review`; Codex: `/review`).

## Envio

Quem cuida do projeto não digita comando. Quando a pessoa disser "sobe pro GitHub": `npm run check`, `git add .`, `git commit -m "<o que mudou, em português>"`, `git push`.

## Checklist de testes vivo

Combinado fixo, vale em toda conversa sobre este app.

Eu (Vinicius) não programo: decido o produto e testo na tela. Você constrói. Para eu saber
**o que testar** e você saber **o que deu errado**, a gente usa uma página de testes viva,
que você mantém e eu marco.

### 1. A página

Na primeira melhoria que precisar de teste, crie uma página publicada chamada
**"Testes do Minha Obra"**, com um banco de dados próprio (as marcas ficam guardadas no
servidor, não no navegador). Se não existir ferramenta de página publicada nesta conversa,
crie um arquivo `testes.html` na pasta do projeto que guarde as marcas no próprio navegador, e
me diga que, nesse caso, você precisa que eu cole o resultado de volta.

A página tem:

- **No topo, a rodada:** nome ("Rodada 2 · Cadastros no banco · 21/10"), uma nota curta do que
  mudou e o que fazer antes de começar (por exemplo, "aperte Ctrl+F5").
- **Um cartão por item a testar**, agrupado por módulo, com:
  - **título**: o que se testa, em uma linha;
  - **passos**: numerados, uma ação por passo, com os nomes exatos que aparecem na tela
    ("Clique em **+ Empresa**", e não "crie uma empresa");
  - **esperado**: o que eu devo ver se deu certo, de forma que eu consiga dizer sim ou não
    sem interpretar;
  - **três botões**: `A testar` · `Funcionou` · `Problema`;
  - **um campo de observação**, para eu escrever o que vi.
- Sem enfeite: a página é ferramenta. Funciona no celular.

### 2. O ciclo

1. **Você constrói** a melhoria.
2. **Antes de me passar**, você confere o que dá para conferir sozinho: roda os testes e o
   "portão" do projeto (`npm run check`), olha a tela no navegador, e quando mexer no banco,
   roda o teste de permissões. **Só me passa o que passou.** Se algo você não conseguiu
   conferir (por exemplo, porque exige a minha senha), diga qual.
3. **Você escreve os itens** na página e me manda o link com um resumo de uma linha por item.
4. **Eu testo** e marco cada item, escrevendo o que vi nos que deram problema.
5. **Eu aviso** ("atualizei os testes"). Você lê as marcas direto da página: eu não preciso
   copiar nada para o chat.
6. **Para cada problema**, você descobre a causa antes de mexer: lê o código, os registros do
   servidor e o banco. Me explica em uma linha o que estava acontecendo e o que mudou.
7. **Você limpa a página**: o que passou **sai**; o que deu problema volta como `A testar`, com
   os passos ajustados; o que é novo entra. Atualiza a nota da rodada.
8. Repete até não sobrar nada. Aí a rodada fecha, e a página diz "nada a testar agora".

**Nada morto fica guardado.** A página mostra só o que falta testar. Histórico, se houver, é
uma linha por item aprovado em `docs/DIARIO.md` (data, o que mudou, o que passou), nunca na página.

### 3. Como escrever um bom item

- **Um comportamento por item.** "Cadastrar e editar empresa" são dois, se puderem falhar
  separados.
- **Passos que qualquer pessoa repete** sem saber programar, na ordem da tela.
- **Esperado observável:** "a empresa aparece na lista com o telefone novo", e não "salva
  corretamente".
- **Teste o caminho errado também:** o campo vazio, o e-mail inválido, o botão clicado duas
  vezes, a coisa que não deveria ser permitida.
- **Diga qual conta usar** quando importar (admin, usuário comum, outro perfil).
- **Diga se o teste grava dado de verdade**, e como desfazer depois.

### 4. Quando o banco de dados entra: os itens que nunca faltam

Para cada tela que passa a gravar, inclua itens que provem:

| Prova | O item pergunta | Por que |
|---|---|---|
| **Ficou gravado** | Depois de salvar, **aperte F5**: continua lá? | O protótipo guardava na memória; o banco pode não ter gravado e a tela fingir que sim |
| **Gravou certo** | O que voltou do F5 é exatamente o que eu digitei (acento, data, número, ordem)? | Tradução entre a tela e o banco perde campo sem avisar |
| **Cada um vê o seu** | Com a conta de outro perfil (e de outra obra), eu vejo só o que devo? | A regra de permissão do banco é a única tranca de verdade; esconder botão não protege nada |
| **Quem não pode, não consegue, e é avisado** | O perfil sem permissão tenta gravar: o banco recusa **e a tela diz por quê**? | Recusa calada parece bug; aviso claro é produto |
| **Nada duplica** | Salvar duas vezes, importar de novo, tirar e pôr de volta: aparece repetido? | Botão clicado duas vezes e reimportação são as duplicatas mais comuns |
| **Apagar não some com histórico** | Desativar algo que outra tela usa: a outra tela continua funcionando? | Registro que outro lugar lê se desativa, não se apaga |
| **Lista vazia e lista grande** | A tela sem nenhum dado diz o que fazer? Com muitos dados, aparece tudo? | O banco corta listas grandes sem avisar (no Supabase, 1.000 linhas) |
| **Erro de rede** | Se a internet cair no meio, a tela diz que não salvou? | Gravação perdida sem aviso é o pior defeito possível |

E do seu lado, antes de me passar qualquer item de banco:

- **Toda mudança no banco é um arquivo versionado** em `supabase/migrations/`, nunca um clique no painel.
- **Um teste de permissões automático**: cada perfil tenta ler e gravar no que é seu e no que é
  do vizinho, dentro de uma transação desfeita no fim (nada fica no banco). Roda depois de
  qualquer mudança de permissão.
- **Revisão de código** em toda mudança que toca a camada de dados, as regras de permissão ou o
  login, antes de subir.
- **Os avisos de segurança do painel do banco** conferidos depois de cada mudança, com cada
  aviso explicado (intencional ou a corrigir).

### 5. O que você nunca faz

- Digitar senha, chave ou token, nem criar conta em meu nome. Se um teste precisa disso, o
  passo diz "entre com a sua conta" e eu faço.
- Colocar qualquer segredo (chave, senha, `.env`) no código, no Git ou na página de testes.
- Usar dado real de cliente como exemplo. Exemplo é sempre fictício.
- Dizer que algo está pronto sem ter rodado o portão e olhado a tela; e, se não conseguiu
  olhar, dizer isso.
- Apagar dado de verdade para "limpar o teste". Desativar, sim; apagar, só com o meu ok.

### 6. Como me responder

Depois de cada rodada, uma resposta curta:

- o que passou e saiu da página;
- uma tabela com cada problema: **o que estava acontecendo** · **o que mudou**;
- o que voltou para teste e o que é novo;
- o que você não conseguiu conferir e por quê;
- o que está esperando uma decisão minha.

Em português simples, sem jargão. Se precisar de uma decisão minha, pergunte uma coisa de cada
vez, com a sua recomendação.
