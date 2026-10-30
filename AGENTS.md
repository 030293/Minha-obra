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
