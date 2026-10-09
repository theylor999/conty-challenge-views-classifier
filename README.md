# Views que não parecem humanas

API que recebe uma série de views por hora e responde `legitimo`, `suspeito` ou `inconclusivo`, com um motivo em português e os sinais medidos. Não há modelo: são sete regras com limites numéricos, todas em `src/rules.ts`.

O critério foi pensado para custar caro acusar errado. Um criador honesto cujo vídeo explodiu de verdade não pode cair no mesmo balde de um pico comprado. Quando a evidência é só parcial, o resultado é `inconclusivo`.

## Como rodar

Node 22 ou mais novo.

```bash
npm install
npm test                          # testes (inclui reprodutibilidade do dataset e das métricas do README)
npm run typecheck
PORT=4317 npm run dev             # API em http://localhost:4317 (PORT padrão: 3000)
npm run evaluate                  # regenera data/dataset.json, mede, grava data/metrics.json
npm run evaluate -- --write-readme   # também atualiza o bloco de métricas deste README
```

## API

`POST /classify`

```json
{
  "timezone": "America/Sao_Paulo",
  "start": "2025-03-10T00:00:00-03:00",
  "views": [812, 640, 505, "..."],
  "mode": "increment"
}
```

- `start`: instante ISO-8601 com fuso, de hora cheia. A posição `i` de `views` cobre `[start + i h, start + i+1 h)`.
- `timezone`: fuso da audiência (padrão `America/Sao_Paulo`). Define o que é madrugada.
- `mode`:
  - `increment` (padrão): `views[i]` são as views novas daquela hora.
  - `cumulative`: `views[i]` é o total acumulado em `start + i h`. As views por hora vêm da diferença entre dois pontos seguidos, então N pontos dão N-1 horas. Só neste modo dá para ver o acumulado cair.
- Mínimo de 48 horas e 100 views no total; abaixo disso a resposta é `inconclusivo` com o motivo (HTTP 200). Máximo de 90 dias.
- Valor negativo, não numérico, fuso desconhecido ou `start` sem fuso: HTTP 400 com `{ "error": { "code", "message" } }`.

Resposta: `label`, `reason` (uma ou duas frases com números), `signals` (`id`, `value`, `unit`, `threshold`, `strong_threshold`, `comparison`, `triggered`, `severity`, `explanation`, `evidence`) e `rule_version`.

`GET /rules` devolve todos os limites em uso. `GET /health` devolve a versão.

## O critério

| sinal | o que mede | moderado | forte |
| --- | --- | --- | --- |
| `spike_shape` | A maior hora vale pelo menos 8× o patamar (mediana das 48 h anteriores), 300 views acima dele e 8 desvios robustos (1,4826·MAD). Se vale, olha a cauda: quantas horas seguidas, depois da fase alta (acima de 50% do excesso), o volume segue acima de 10% do excesso. | cauda de 2 a 4 h | cauda de 0 a 1 h (corte seco) |
| `mechanical_regularity` | Sequência de janelas de 12 h seguidas, cada uma com coeficiente de variação até 3% e média de 50 views/h ou mais. Dois patamares planos em níveis diferentes não se somam: as janelas que cruzam o degrau reprovam. Audiência real tem ruído e ciclo diário. | 12 h seguidas | 24 h seguidas |
| `repeated_values` | O mesmo valor exato (20 ou mais) várias horas seguidas. | nunca | 6 h seguidas |
| `round_numbers` | Horas seguidas em múltiplos exatos de 100 (valor 500 ou mais): entrega em pacotes. Moderado porque há fontes que arredondam. | 6 h seguidas | nunca |
| `circadian_mismatch` | Mediana das horas 02h–05h dividida pela mediana das 10h–21h no fuso informado. Horas já explicadas por um pico ou por uma queda a zero ficam fora da conta. | razão de 0,8 ou mais | nunca: audiência de outro fuso dá o mesmo padrão |
| `purge_drop` | Maior queda do acumulado (só em `cumulative`): a plataforma removeu views que contava. | 0,5% | 3% |
| `drop_to_zero` | O ritmo (mediana das 24 h anteriores, 100/h ou mais) cai em 1 h para 2% ou menos e fica assim por 6 h ou mais. Moderado porque vídeo ocultado ou falha de coleta fazem o mesmo. | sim | nunca |

Um pico orgânico tem cauda: a fase alta termina e o volume desce por muitas horas (cauda de 5 h ou mais). Um pico comprado é um retângulo: volta ao patamar em uma hora. Cauda de 2 a 4 h é o meio do caminho e não basta para acusar. Cauda de 5 h ou mais já descarta o pulso, mesmo que a série acabe antes de o volume voltar ao patamar (o texto então diz "ainda acima do patamar quando a série termina"). Se restam menos de 3 horas de dados depois da fase alta, ou a série termina com uma cauda de 2 a 4 h ainda em curso, o sinal fica `undetermined`: os dados não respondem.

### Regra de decisão

```
suspeito      1 sinal forte, ou 2 sinais moderados
inconclusivo  1 sinal moderado só, ou um sinal indeterminado,
              ou série curta (< 48 h) ou pequena (< 100 views)
legitimo      nenhum sinal acima do limite
```

O `reason` de `suspeito` junta as explicações dos dois sinais mais fortes. O de `inconclusivo` diz qual sinal apareceu e que um só não basta. O de `legitimo` resume o maior pico e o ritmo diário.

### Orgânico e comprado, mesma altura

Mesmo patamar, mesma hora, mesmo pico de 20.000 views/h. Cada coluna do gráfico é 2 horas, a série tem 7 dias. Só a cauda muda (`examples/` guarda as séries; `test/organic-vs-bought.test.ts` afirma a diferença).

```
organico  ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁██▆▅▄▄▃▃▃▂▂▂▂▂▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁
comprado  ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁██▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁
parcial   ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁█▅▂▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁
```

## Exemplos reais

Saídas capturadas com o servidor rodando (`PORT=4317 npm run dev`). O `reason` é o texto devolvido, sem edição.

```bash
curl -s -X POST localhost:4317/classify -H 'content-type: application/json' -d @examples/organic-viral.json
```
```
legitimo
Nenhum dos 7 sinais passou do limite: o pico de 21.289/h (21,9× o patamar) teve cauda de decaimento de 18 h, madrugada em 31,9% da tarde/noite e não há trechos mecânicos nem quedas bruscas.
```

```bash
curl -s -X POST localhost:4317/classify -H 'content-type: application/json' -d @examples/bought-pulse.json
```
```
suspeito
Em 13/03 às 21h, as views saltaram de ~1.027/h para 21.060/h (21,9× o patamar), ficaram nesse nível por 3 h e voltaram ao patamar anterior em 1 h, sem cauda de decaimento.
```

Série curta e entrada inválida:

```bash
curl -s -X POST localhost:4317/classify -H 'content-type: application/json' -d '{"start":"2025-03-10T00:00:00-03:00","views":[10,12,9]}'
# {"label":"inconclusivo","reason":"A série tem 3 h e o mínimo para avaliar é 48 h (dois ciclos diários completos).","signals":[],"rule_version":"2026-10.1"}
curl -s -X POST localhost:4317/classify -H 'content-type: application/json' -d '{"start":"2025-03-10T00:00:00-03:00","views":[10,-2,9]}'
# {"error":{"code":"invalid_views","message":"views[1] deve ser um número finito e não negativo."}}
```

## O caso em que prefere não acusar

`examples/partial-decay.json`: mesma base e mesma hora, um pico de 21 mil views/h que caiu em 2 horas, bem mais rápido que um viral típico e bem mais devagar que um corte seco. Pode ser uma citação ao vivo na TV; pode ser compra mal disfarçada. Os dados não separam os dois.

```bash
curl -s -X POST localhost:4317/classify -H 'content-type: application/json' -d @examples/partial-decay.json
```
```json
{
  "label": "inconclusivo",
  "reason": "Em 13/03 às 21h, as views saltaram de ~1.027/h para 16.787/h (21,9× o patamar), e a cauda durou só 2 h acima de 10% do excesso: curta para um pico orgânico (esperado mais de 4 h), mas não é um corte seco (1 h ou menos). Um único sinal moderado não basta para acusar (a regra pede 1 sinal forte ou 2 moderados).",
  "signals": [
    {
      "id": "spike_shape",
      "unit": "horas de cauda",
      "threshold": 4,
      "strong_threshold": 1,
      "comparison": "<=",
      "value": 2,
      "triggered": true,
      "severity": "moderate",
      "explanation": "Em 13/03 às 21h, as views saltaram de ~1.027/h para 16.787/h (21,9× o patamar), e a cauda durou só 2 h acima de 10% do excesso: curta para um pico orgânico (esperado mais de 4 h), mas não é um corte seco (1 h ou menos).",
      "evidence": { "peak": 21289, "baseline": 970, "ratio": 21.94742268041237, "hold_hours": 2, "tail_hours": 2 }
    },
    "... mais 6 sinais, todos com triggered=false (recortado aqui; a API devolve todos)"
  ],
  "rule_version": "2026-10.1"
}
```

Outros dois casos em que o classificador se abstém, ambos nos testes e no dataset: vídeo que o criador ocultou (views vão a zero de uma hora para outra, só `drop_to_zero`) e audiência em outro fuso (só `circadian_mismatch`; com `timezone` certo vira `legitimo`).

## Métricas

Geradas por `npm run evaluate`, não escritas à mão. O bloco abaixo é o texto exato que `npm run evaluate -- --write-readme` grava; `test/readme-metrics.test.ts` mede de novo e **falha se o bloco divergir** (a própria suíte também prova que a comparação falha com um número adulterado).

Falso positivo = série legítima classificada `suspeito`, dividido pelo total de séries legítimas. `inconclusivo` não conta como erro de acusação, mas aparece na linha própria porque também custa: o time de contas tem de olhar na mão.

<!-- metrics:start -->
Conjunto de ajuste: semente 2025, 680 séries (400 legítimas, 280 suspeitas), arquivo `data/dataset.json`.

- Falsos positivos: **3 de 400 séries legítimas = 0,8%**.
- Falsos positivos só nos cenários fáceis: 0 de 160 = 0,0%.
- Legítimas que o classificador deixou como inconclusivo: 159 de 400 = 39,8%.
- Suspeitas classificadas como legítimo (falso negativo): 82 de 280 = 29,3%.
- Suspeitas pegas, contando as fora do alcance: 180 de 280 = 64,3%.
- Suspeitas dentro do alcance do critério que foram pegas: 180 de 200 = 90,0%.

| verdade \ classificador | legitimo | suspeito | inconclusivo |
| --- | --- | --- | --- |
| legitimo | 238 | 3 | 159 |
| suspeito | 82 | 180 | 18 |

| cenário | verdade | n | legitimo | suspeito | inconclusivo |
| --- | --- | --- | --- | --- | --- |
| `legit_steady` | legitimo | 40 | 40 | 0 | 0 |
| `legit_viral` | legitimo | 40 | 40 | 0 | 0 |
| `legit_weekend` | legitimo | 40 | 40 | 0 | 0 |
| `legit_sparse` | legitimo | 40 | 33 | 0 | 7 |
| `legit_cumulative` (difícil) | legitimo | 40 | 26 | 0 | 14 |
| `legit_night_audience` (difícil) | legitimo | 40 | 0 | 0 | 40 |
| `legit_unlisted` (difícil) | legitimo | 40 | 7 | 0 | 33 |
| `legit_rounded_source` (difícil) | legitimo | 40 | 0 | 0 | 40 |
| `legit_large_smooth` (difícil) | legitimo | 40 | 36 | 3 | 1 |
| `legit_flash_pulse` (difícil) | legitimo | 40 | 16 | 0 | 24 |
| `bought_pulse` | suspeito | 40 | 0 | 34 | 6 |
| `night_bot` (difícil) | suspeito | 40 | 2 | 27 | 11 |
| `bot_drip` | suspeito | 40 | 0 | 39 | 1 |
| `bot_stopped` | suspeito | 40 | 0 | 40 | 0 |
| `purge_drop` | suspeito | 40 | 0 | 40 | 0 |
| `bought_disguised_tail` (difícil) (fora do alcance) | suspeito | 40 | 40 | 0 | 0 |
| `bought_slow_drip` (difícil) (fora do alcance) | suspeito | 40 | 40 | 0 | 0 |

Conjunto de controle: semente 31337, mesma receita, não usada para escolher nenhum limite. Falsos positivos: **3 de 400 séries legítimas = 0,8%**; falsos negativos 84 de 280 = 30,0%; suspeitas dentro do alcance pegas 179 de 200 = 89,5%.
<!-- metrics:end -->

Leituras honestas dessa tabela:

- O dataset é meu, as 17 receitas são minhas suposições sobre o que é orgânico e o que é comprado. O número mede o critério contra essas suposições, não contra o mundo.
- A taxa de falso positivo vem só de `legit_large_smooth`: canal grande com ruído de 1% a 4% e pouco ciclo diário, que parece mecânico. Deixei esses casos de propósito e não afrouxei os limites para escondê-los.
- A prevalência de suspeitas no dataset (41%) é inventada. As taxas condicionais (falso positivo sobre as legítimas, falso negativo sobre as suspeitas) não dependem dela. Precisão (de tudo que foi acusado, quanto era mesmo suspeito) e contagens absolutas dependem, e por isso não são reportadas.
- Os falsos negativos altos vêm dos dois cenários marcados "fora do alcance": compra que imita um pico orgânico e compra diluída com ciclo diário. Na lista "dentro do alcance" a taxa de captura é a linha correspondente do bloco.
- A taxa de inconclusivo entre as legítimas é alta porque eu pus de propósito cinco cenários difíceis em que o certo é se abster (outro fuso, fonte que arredonda, vídeo ocultado, pico curto, ajuste do acumulado). Nos cenários fáceis ela só aparece em `legit_sparse`, séries com menos de 100 views no total.
- Falta no dataset um pico legítimo de corte seco (link fixado na home de um portal por duas horas). Pela forma ele é igual ao pulso comprado; está em "o que não detecta".

## Como os limites foram escolhidos

Os números (8×, 3%, 12 h e 24 h, 0,8, 0,5% e 3%) saíram de raciocínio, não de busca: 3% de variação em 12 h é menos do que o ruído de contagem mais o ciclo diário dão numa audiência real; 8× é o salto abaixo do qual fim de semana e feriado (até 3× nos dados) não chegam. Não rodei grade nem otimizei nenhum limite contra a taxa.

O que mudei depois de ver erros no conjunto de ajuste foi a estrutura, não os números:

1. O patamar do pico passou da mediana da série inteira para a mediana das 48 h antes do pico. Num viral de cauda longa em série curta, a mediana global caía dentro da cauda e o pico deixava de contar como pico.
2. As horas dentro de um pico (até voltar a menos de 1,5× o patamar) ou depois de uma queda a zero saem da conta do ritmo diário. Sem isso, a cauda de um viral elevava a madrugada e gerava `inconclusivo` em orgânicos.

Risco de sobreajuste: esses dois ajustes foram feitos olhando a semente 2025. Por isso há um conjunto de controle (semente 31337), que só olhei depois do critério fechado. Depois disso corrigi bugs apontados em revisão (união de patamares na regularidade, hora indefinida no texto da queda, validação de `start`) e vi as duas sementes a cada rodada de `npm run evaluate`; nenhum limite foi escolhido olhando o controle. Ele protege contra ruído específico de uma amostra; não protege contra erro nas minhas receitas, porque usa as mesmas.

## O que não detecta

- Compra diluída em dias, com volume parecido com o orgânico e seguindo o ciclo diário (`bought_slow_drip`: 0 de 40 pegos). É o caso mais provável em produção e este critério não o vê.
- Compra feita com decaimento imitado (`bought_disguised_tail`): pela forma é igual a um viral.
- Robôs com ruído e ritmo circadiano humanos. Qualquer regra de forma é contornável por quem a conhece.
- Pico legítimo de corte seco: link na home de portal, sorteio que fecha, tráfego pago (anúncio) desligado de uma vez. Vira `suspeito` por ter a forma de um pulso. O critério mede forma, não origem; para a origem faltam dados de fonte de tráfego.
- Mais de um evento: só o maior pico é analisado. Pulsos menores ficam de fora (os trechos mecânicos e quedas são vistos na série inteira).
- Picos abaixo de 300 views acima do patamar, canais abaixo de 100 views no total e séries abaixo de 48 h.
- Conta contra vídeo: a série é uma só. Não compara com outros vídeos do mesmo criador, nem retenção, origem, geografia ou engajamento junto das views. Pods de engajamento combinado entre criadores não têm forma própria.
- Fuso: se a audiência está em outro fuso e o `timezone` informado é o errado, só o sinal circadiano reage, e ele sozinho nunca acusa.

## Estrutura

```
src/signals/     sinais, funções puras (série -> sinal)
src/classifier.ts  regra de decisão e motivo
src/rules.ts     todos os limites e a versão da regra
src/series.ts    validação e conversão para views por hora
src/dataset/     PRNG mulberry32, cenários, gerador
src/evaluation/  métricas e texto do README
src/http/        Hono
scripts/         evaluate.ts, make-examples.ts
data/            dataset.json (commitado), metrics.json
examples/        séries usadas nos exemplos acima
```

## Testes

`npm test`: casos óbvios (série estável, viral, pulso, gotejamento constante, valor repetido, madrugadas de robô, queda do acumulado), casos de abstenção, validação de entrada, determinismo, o lado a lado orgânico x comprado, HTTP, reprodutibilidade bit a bit de `data/dataset.json` e as métricas do README.

## Uso de IA

O código e os testes foram escritos com um assistente de IA (Claude), que eu dirigi: eu defini o critério, os sinais e o formato da resposta, e o assistente produziu a primeira versão do código, do gerador e dos testes. Depois eu revisei e ajustei:

- Troquei o patamar do pico (mediana da série toda para as 48 h anteriores) depois de ver séries virais legítimas, de cauda longa, serem tratadas como "sem pico".
- Mantive o sinal circadiano limitado a moderado desde o desenho e confirmei no cenário de audiência em outro fuso (`legit_night_audience`) que isso importa: o ritmo invertido aparece nas 40 séries legítimas dele, e se o sinal pudesse ser forte todas seriam acusadas.
- Rodei o caso de abstenção (meia-vida de 1,2 h) contra os limites de cauda e confirmei que ele cai entre o corte seco (1 h) e o orgânico (5 h), em vez de escolher um número que parecesse bonito.
- Mantive os falsos positivos de `legit_large_smooth` em vez de afrouxar o limite de regularidade, e coloquei a semente de controle fora do ajuste.

Rodei `npm test`, `npm run evaluate` e os `curl` acima antes de entregar.
