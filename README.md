# draft

<!-- metrics:start -->
Conjunto de ajuste: semente 2025, 680 séries (400 legítimas, 280 suspeitas), arquivo `data/dataset.json`.

- Falsos positivos: **3 de 400 séries legítimas = 0,8%**.
- Falsos positivos só nos cenários fáceis: 0 de 160 = 0,0%.
- Legítimas que o classificador deixou como inconclusivo: 151 de 400 = 37,8%.
- Suspeitas classificadas como legítimo (falso negativo): 82 de 280 = 29,3%.
- Suspeitas dentro do alcance do critério que foram pegas: 181 de 200 = 90,5%.

| verdade \ classificador | legitimo | suspeito | inconclusivo |
| --- | --- | --- | --- |
| legitimo | 246 | 3 | 151 |
| suspeito | 82 | 181 | 17 |

| cenário | verdade | n | legitimo | suspeito | inconclusivo |
| --- | --- | --- | --- | --- | --- |
| `legit_steady` | legitimo | 40 | 40 | 0 | 0 |
| `legit_viral` | legitimo | 40 | 40 | 0 | 0 |
| `legit_weekend` | legitimo | 40 | 40 | 0 | 0 |
| `legit_sparse` | legitimo | 40 | 33 | 0 | 7 |
| `legit_cumulative` (difícil) | legitimo | 40 | 34 | 0 | 6 |
| `legit_night_audience` (difícil) | legitimo | 40 | 0 | 0 | 40 |
| `legit_unlisted` (difícil) | legitimo | 40 | 7 | 0 | 33 |
| `legit_rounded_source` (difícil) | legitimo | 40 | 0 | 0 | 40 |
| `legit_large_smooth` (difícil) | legitimo | 40 | 36 | 3 | 1 |
| `legit_flash_pulse` (difícil) | legitimo | 40 | 16 | 0 | 24 |
| `bought_pulse` | suspeito | 40 | 0 | 34 | 6 |
| `night_bot` (difícil) | suspeito | 40 | 2 | 27 | 11 |
| `bot_drip` | suspeito | 40 | 0 | 40 | 0 |
| `bot_stopped` | suspeito | 40 | 0 | 40 | 0 |
| `purge_drop` | suspeito | 40 | 0 | 40 | 0 |
| `bought_disguised_tail` (difícil) (fora do alcance) | suspeito | 40 | 40 | 0 | 0 |
| `bought_slow_drip` (difícil) (fora do alcance) | suspeito | 40 | 40 | 0 | 0 |

Conjunto de controle: semente 31337, mesma receita, nunca olhado ao ajustar os limites. Falsos positivos: **3 de 400 séries legítimas = 0,8%**; falsos negativos 84 de 280 = 30,0%; suspeitas dentro do alcance pegas 181 de 200 = 90,5%.
<!-- metrics:end -->
