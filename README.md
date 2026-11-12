# PDFWebSigner

Posicionador visual de campos de assinatura em PDF. A proposta é abrir um PDF
no navegador, marcar uma área e copiar a posição para reutilizá-la em um script.

## Estado atual

Estamos recomeçando com uma base simples em Astro. Por enquanto, há somente a
estrutura inicial do framework: **nenhuma lógica de PDF foi implementada nesta
nova base**. A página de demonstração do Astro permanece até definirmos a interface.

A implementação anterior está em `versao-1/`, preservada como referência histórica.
Os recursos, versões testadas e resultados descritos no README daquela pasta dizem
respeito à versão anterior, não à aplicação atual.

## Stack e estrutura

Astro estático, TypeScript estrito, CSS simples e pnpm, diretamente na raiz.

```text
src/
  pages/        Páginas
  layouts/      Estrutura do documento HTML
  components/   Componentes quando necessários
  assets/       Recursos processados pelo Astro
public/         Arquivos públicos
versao-1/       Implementação anterior arquivada
```

Essa estrutura já é suficiente para começar. Novos diretórios e dependências
serão adicionados apenas conforme as próximas etapas exigirem.

## Desenvolvimento

O `package.json` atual declara Node.js >=22.23.4. Use pnpm e preserve o lockfile.
Execute os comandos na raiz:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

O servidor informa o endereço local, normalmente `http://localhost:4321`.

```sh
pnpm build
pnpm preview
```

O build estático desta base gera `dist/` na raiz. Não instala nem executa Python.
Não há suíte de testes configurada nesta etapa.

## Qualidade de código

Prettier padroniza a formatação; ESLint verifica JavaScript, TypeScript e Astro.
As configurações foram adaptadas do projeto OPAA. A pasta `versao-1/` fica fora
da formatação, do lint e da verificação TypeScript.

| Comando             | Ação                                                                   |
| ------------------- | ---------------------------------------------------------------------- |
| `pnpm check`        | Verifica tipos e arquivos Astro                                        |
| `pnpm check-all`    | Executa tipos, lint e verificação de formatação, sem aplicar correções |
| `pnpm lint`         | Verifica o código sem aplicar correções                                |
| `pnpm lint:fix`     | Aplica correções automáticas do ESLint                                 |
| `pnpm format:check` | Verifica formatação sem alterar arquivos                               |
| `pnpm format`       | Formata os arquivos do projeto                                         |

Antes de fazer commit, execute `pnpm check-all`. O comando para na primeira
verificação que falhar. Se necessário, aplique `pnpm lint:fix` e `pnpm format`,
revise as alterações e execute `pnpm check-all` novamente.

O padrão usa dois espaços, aspas simples, sem ponto e vírgula e finais de linha
LF, com suporte a `.astro` e `.jsonc`. Os comandos de correção são explícitos;
não são executados automaticamente pelo build. O starter existente ainda pode
apresentar diferenças de formatação em relação ao padrão escolhido.

## Direção do projeto

A futura edição Web permitirá abrir um PDF local, navegar pelas páginas, marcar
uma área e copiar coordenadas ou um comando para criar um campo vazio. Os PDFs
permanecerão no navegador. A interface será construída gradualmente.

A edição Local, com assinatura por certificado, será discutida depois. Não há
backend, integração pyHanko, fila, banco ou processamento em lote nesta base.

## Combinados

As regras de trabalho estão em [AGENTS.md](AGENTS.md). Agentes usam Git somente
para consultas e não realizam publicação. Não colocar documentos de usuários ou
segredos em arquivos públicos, no repositório ou nos artefatos de build.

O README anterior foi usado como referência para esta descrição. Nenhum outro
arquivo do software arquivado foi reaproveitado. Reutilização futura de recursos
legados depende de conferir licença e atribuição.
