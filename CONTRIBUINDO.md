# Como escrever uma aula do Guia Tailwind

Este guia é para quem **nunca programou**. Cada página é uma aula inteira, com 2.800 a 4.000
palavras de texto visível, escrita como uma conversa: uma pessoa (a Ana) tem um problema, tenta,
erra, entende e resolve. O leitor aprende a ler HTML e a usar as classes do Tailwind v4 — e as
caixas da página compilam o HTML dele com o **Tailwind de verdade**.

## 1. O esqueleto de uma aula

Copie `tools/aula-modelo.html` (ou uma aula já aprovada) e troque o conteúdo. O que o testador
cobra em toda aula:

| Peça | Quantas | Observação |
| --- | --- | --- |
| `<title>` | 1 | termina exatamente em `\| Guia Tailwind` |
| `<meta name="description">` | 1 | de 100 a 180 caracteres |
| `<h1>` com `<span class="hl">` | 1 | o destaque cai na palavra-chave |
| `p.intro` | 1 | apresenta a cena da Ana |
| `div.note` | 1 | "Você vai aprender", logo depois do intro |
| `<h2>` de conteúdo | 10 | numerados `1.` … `10.` |
| `<h2>11. Resumo</h2>` | 1 | e um `div.note` "Para lembrar" no fim |
| `dl.anatomy` | 1 | 3 a 6 termos com `<dt>`/`<dd>` |
| `pre.term` | 2 | saída de terminal/CSS gerado (texto cru, sem escape) |
| `div.cenario` | 3 | cada um com `<h3>` e um parágrafo |
| `table.ref` | 2 | sempre dentro de `div.table-wrap` |
| `div.mc` | 3 | `data-answer="1\|2\|3"` + `<label><input type="radio">` |
| `div.exercise` | 1 | com `.ex-code` e um `<input data-answer="...">` |
| `div.pager` | 2 | um no começo e um no fim do `.content` |
| `div.trytailwind` | 3 | as caixas que rodam o Tailwind (veja §2) |

Além disso: `<!doctype html>`, `lang="pt-BR"`, favicon `data:,`, `assets/style.css`, o script do
tema no `<head>`, `.layout > nav.sidebar#sidebar + main.main > .content` e `assets/site.js` antes
de `</body`. Tudo isso já está no modelo.

Páginas de **projeto** (`projeto-*.html`) seguem o mesmo esqueleto com 9 `<h2>`, 2 `dl.anatomy`,
3 `pre.term`, 3 `table.ref` e 3 caixas. Páginas de **referência** (`ref-*.html`) têm 8 `<h2>`,
1 `dl.anatomy`, 2 `pre.term`, 4 `table.ref`, 2 caixas e **não** têm cenário, `.mc` nem exercício.

## 2. A caixa que roda o Tailwind

```html
<div class="trytailwind" data-goal="css:#alvo|padding=16px;;rule:padding: calc(var(--spacing) * 4)">
  <p class="try-task">Dê 16 px de respiro interno ao cartão.</p>
  <pre class="html"><div id="alvo" class="p-1">Pão quentinho</div></pre>
  <pre class="out">
padding: 4px
</pre>
  <pre class="solucao"><div id="alvo" class="p-4">Pão quentinho</div></pre>
</div>
```

O que cada peça faz:

- `pre.html` — **o editor**. O leitor edita, clica em **Rodar** e o Tailwind compila esse HTML num
  iframe de verdade. `<`, `>` e `&` ficam escapados (`&lt;`, `&gt;`, `&amp;`).
- `pre.solucao` — o HTML que cumpre a missão, escondido; o botão **Ver solução** copia para o editor.
- `p.try-task` — o enunciado, em uma ou duas frases.
- `data-goal` — a meta que o botão **Verificar** confere (veja §3).
- `pre.out` — **opcional**: o painel com o CSS computado, para o leitor ver o resultado sem clicar.
  Só vale o que o motor devolve: rode `node tools/verificar-saidas.js --fix pagina.html` e ele
  grava a saída certa.
- `data-largura="768"` — largura da prévia (240 a 1280; o padrão é 640). Use quando a aula for de
  breakpoint.
- `data-tema="escuro"` — prévia no tema escuro.
- `data-saida="css"` no `pre.html` — em vez do CSS computado, o `pre.out` mostra as **regras
  geradas** para as classes usadas (bom para ensinar `@media`, `hover:` e afins).

O painel mostra, para o elemento com `id="alvo"` (ou o primeiro filho da prévia), só as
propriedades que as classes dele **mudaram** — `padding: 16px`, `background-color: oklch(...)`.
Tailwind v4 escreve cores em `oklch()` e `border-radius` em `px`.

## 3. A meta (`data-goal`)

Passos separados por `;;`, na ordem:

| Passo | Exemplo | Confere |
| --- | --- | --- |
| `css:` | `css:#alvo\|padding=16px` | o CSS **computado** daquele seletor |
| `rule:` | `rule:padding: calc(var(--spacing) * 4)` | um trecho do **CSS gerado** |
| `conta:` | `conta:.card=3` | quantos elementos casam com o seletor |
| `texto:` | `texto:Pão quentinho` | um trecho do texto que aparece na prévia |
| `largura:` | `largura:768` | a largura da prévia |
| `escuro:` | `escuro:1` | o tema da prévia |

Regras de ouro: a meta tem de **falhar** no HTML inicial (senão a missão não pede nada) e
**passar** na solução. Sempre inclua um passo observável (`css:`, `rule:`, `conta:` ou `texto:`).

## 4. Privacidade

Nada da máquina de quem escreve entra na página. Use sempre:

- `ana@notebook`, `/home/ana`, `America/Sao_Paulo`;
- IPs de exemplo (`192.0.2.10`), domínio `loja.test`;
- nome do projeto inventado (padaria, livraria, estudio).

O testador reprova nome real, `/home/<outro>`, `/root`, IP da VPS, MAC e SSID.

## 5. Conferir antes de commitar

```bash
export PATH=/home/wallyson/.local/node22/bin:$PATH
node tools/testar-missoes.js -q pagina.html        # contrato, texto, links, caixas e metas
node tools/verificar-saidas.js --fix pagina.html   # grava o pre.out que o motor devolve
node tools/verificar-saidas.js -q pagina.html      # confere de novo (tem de dar 0 problema)
node tools/testar-navegador.js pagina.html         # abre no Chromium, clica nas caixas
node tools/tw.js pagina.html                       # vê o CSS que cada caixa produz
```

- `--completo` transforma em FALHA o link para página que ainda não existe.
- `node tools/empacotar.js --checar` garante que o compilador publicado é o do `package.json`.
- Commit: `git add pagina.html && git commit -m "aula: <título>"`. **Nunca** `git push` sem o OK
  do Wallyson, e nunca `git add -A` neste repositório.
