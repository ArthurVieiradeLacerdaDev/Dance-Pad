# Evil Dance

Jogo de ritmo para a feira de tecnologia, com quatro direções como no protótipo físico da equipe. Usa HTML, CSS e JavaScript puro, sem dependências de execução. As referências visuais do Pump It Up inspiram a apresentação; o controle segue as **quatro setas do tapete de vocês**.

## Executar

Com Node.js 20 ou superior:

```powershell
npm start
```

Abra **http://localhost:4173**. Também funciona com o Live Server do VS Code. Não abra `index.html` com duplo clique: módulos, Workers e carregamento de áudio precisam de um servidor HTTP.

Não é necessário executar `npm install`. As fontes do Google são opcionais; se a rede estiver indisponível, a interface usa fontes do computador. As bases instrumentais, o motor e os MP3 do projeto funcionam sem internet depois que o servidor local estiver rodando.

1. Escolha uma das bases brasileiras, um áudio do projeto ou importe seu arquivo.
2. Use **Primeiros passos** para quem está começando e **Modo feira · 60 s** para manter a fila andando.
3. Clique em **Vamos jogar**. Depois da contagem, aperte **← ↑ ↓ →** quando as notas encontrarem os alvos na parte inferior da pista.
4. **Espaço** pausa/continua; **Esc** volta para a seleção. Os alvos também aceitam toque/clique. Ao trocar de aba ou perder foco, a partida pausa.
5. Veja pontuação, precisão, melhor combo e contagens no resultado. É possível repetir a partida ou escolher outra faixa.

## Plano de melhoria e implementação

| Etapa | Problema anterior | Implementação |
| --- | --- | --- |
| Motor e sincronia | Notas avançavam em pixels por quadro; o mapa marcava o nascimento, não o acerto | Posição e julgamento usam o mesmo relógio do áudio; cada `time` marca a chegada ao alvo |
| Fases automáticas | Apenas 4–8 notas escritas à mão por música | Análise espectral em Worker, estimativa de BPM, detecção de ataques e fases até o fim do trecho |
| Entrada | Só mensagens MQTT; impossível testar só no PC | Teclado, toque e adaptador comum preparado para o tapete |
| Experiência na feira | Seleção e retorno básicos | Três níveis, contagem inicial, pausa, resultado, trechos de 60 s e prévia de 12 s |
| Identidade visual | Fundo preto, botões e emojis | Identidade Evil Dance, capas vetoriais em CSS, quatro cores, ícones SVG, trilhas e efeitos de acerto |
| Reuso da análise | Alteração manual do código para cada música | Importação local, reutilização da análise por sessão e exportação da fase e dos ataques em JSON |
| Próxima etapa física | Conexão automática a broker público sem tapete disponível | MQTT desativado; conectar o cliente WebSocket ao adaptador quando o hardware estiver pronto |

Não foram alterados ou removidos os três MP3 existentes.

## Músicas para a feira

Estas escolhas são recomendações de jogabilidade: a gravação específica precisa ser ouvida e testada no estande. O BPM não é presumido pelo título; o programa mede o arquivo carregado.

| Música sugerida | Artista | Motivo e configuração inicial |
| --- | --- | --- |
| [O Sol](https://www.youtube.com/watch?v=YVJijQIualA) | Vitor Kley | Minha primeira opção: pop leve, pulsação acessível. Começar em Primeiros passos, 60 s. |
| [País Tropical](https://globoplay.globo.com/v/4211235/) | Jorge Ben Jor | Balanço dançante e refrão participativo. Primeiros passos reduz a densidade das síncopes. |
| [Não Quero Dinheiro](https://record.r7.com/balanco-geral/hit-de-tim-maia-nao-quero-dinheiro-volta-a-fazer-sucesso-em-trios-eletricos-e-bailes-no-brasil-05032025/) | Tim Maia | Energia para o público; uma seta a cada duas batidas deixa a atividade acessível. |

As três sugestões estão na aba **Sugestões para a feira**. O botão **Carregar áudio e jogar** permite associar um MP3/WAV local à música e gerar a fase. Os arquivos dessas gravações **não vieram no projeto e não estão embutidos**; não há download de áudio do YouTube nem substituição silenciosa por outra faixa. Depois de carregar, clique em Vamos jogar.

Para deixar uma gravação disponível permanentemente no estande, coloque o arquivo na pasta e configure seu `src` em `src/catalog.js`. Arquivos importados pelo seletor ficam apenas na sessão: recarregar a página exige selecionar novamente. A exportação guarda os tempos e a análise, não o áudio.

**Ai Se Eu Te Pego**, que já estava no projeto, também pode funcionar: repetição e pulsação ajudam iniciantes. **Evidências** é uma alternativa mais lenta, com variações que podem tornar a leitura de ritmo menos direta. A terceira faixa foi preservada como **Pós**, sem atribuir um artista sem verificar o arquivo.

### Medições dos MP3 existentes

Análise executada no Chromium, usando os arquivos do projeto (valores estimados pelo algoritmo, não BPMs de referência):

| Arquivo | Duração | BPM estimado | Força de periodicidade (0–1) | Ataques no áudio completo | Passos fáceis / 60 s |
| --- | --- | --- | --- | --- | --- |
| Ai Se Eu Te Pego MP3.mp3 | 2:45 | 96,5 | 0,66 | 694 | 47 |
| evidencias.mp3 | 4:59 | 98,3 | 0,41 | 1.053 | 48 |
| pos.mp3 | 3:19 | 105,3 | 0,37 | 679 | 51 |

O primeiro arquivo apresentou a periodicidade mais forte no detector. Nos demais, a pontuação mais baixa reforça a necessidade de ouvir a fase e revisar a sincronia antes da feira. O jogo mostra os dados medidos e permite corrigir o BPM; gerar uma fase não garante que toda gravação tenha pulso perfeitamente regular.

### Três bases novas e jogáveis agora

Para permitir testar tudo imediatamente, `src/synth.js` compõe três instrumentais originais de 64 segundos, sem samples externos e sem copiar as melodias das sugestões:

| Base | Referência rítmica | Andamento da composição | Estimativa inicial do detector* | Passos fáceis / 60 s* |
| --- | --- | --- | --- | --- |
| Balanço do Nordeste | Forró: grave, percussão e timbre de palheta | 100 BPM | ~100 BPM | ~44 |
| Passinho Tropical | Samba-pop: baixo e percussão sincopada | 108 BPM | ~109 BPM | ~53 |
| Circuito do Grave | Funk leve: bumbo, caixa e baixo eletrônico | 112 BPM | ~112 BPM | ~55 |

\* Medições do teste DSP em PCM mono; a reamostragem do navegador pode mudar levemente o BPM e o número de passos. São bases de prototipação, não as gravações comerciais acima. O próprio áudio sintetizado passa pelo analisador; não existe uma lista de passos predefinida para essas bases.

## Como a geração automática funciona

1. **Decodificação:** `decodeAudioData` lê o arquivo inteiro. `OfflineAudioContext` converte para mono a 11.025 Hz com reamostragem do navegador. Entradas: 3 segundos a 10 minutos, no máximo 50 MB para arquivos importados.
2. **Espectro:** janela Hann de 1.024 amostras (~93 ms), com avanço de 256 (~23 ms). A FFT separa regiões aproximadas de graves (43–200 Hz), médios (200–2.000 Hz) e agudos (2.000–5.512 Hz).
3. **Ataques:** fluxo espectral positivo detecta aumentos de energia por região. Normalização por percentil evita que só a região mais forte domine; graves recebem peso 55%, médios 30%, agudos 15%. Um limiar adaptativo e um intervalo mínimo de 120 ms filtram picos fracos/repetidos. RMS evita passos nos silêncios.
4. **Pulsação:** autocorrelação do envelope busca 75–160 BPM, considerando um e dois períodos. Busca de fase escolhe o alinhamento da grade que melhor coincide com os ataques. O valor de confiança é uma força de periodicidade, não uma probabilidade de acerto.
5. **Mapa:** a grade de pulsação procura ataques próximos (até ±100 ms) para posicionar os passos. Sem ataque próximo, usa a pulsação estimada em regiões ativas. A região espectral dominante ajuda a escolher a direção; regras determinísticas alternam os lados e evitam repetição imediata. Não há aleatoriedade por quadro.
6. **Dificuldade:** Primeiros passos usa uma nota a cada duas batidas, intervalo mínimo de 650 ms e viagem de 2,65 s. No ritmo usa a pulsação principal, mínimo de 360 ms e viagem de 2,25 s. Desafio permite ataques intermediários reais, mínimo de 250 ms e viagem de 1,9 s. Nenhum nível gera notas simultâneas.
7. **Reprodução:** `AudioBufferSourceNode` agenda o áudio. `getOutputTimestamp`, quando disponível, aproxima a posição efetivamente ouvida; a posição das setas é recalculada a partir desse tempo em cada frame. FPS e velocidade de queda não determinam a janela de acerto.

A animação usa `transform`, evitando atualizar `top` a cada quadro. Acertos exibem expansão do alvo, brilho, partículas e diferença temporal em milissegundos. `prefers-reduced-motion` reduz os efeitos, mantendo o movimento das notas necessário para jogar.

**Precisão:** Perfeito ±65 ms (1.000 pontos), Muito bem ±120 ms (700), Quase ±180 ms (400); fora disso não consome a nota. Notas perdidas e apertos fora do tempo quebram combo e reduzem precisão. O multiplicador cresce por blocos de 10 acertos, até 2×. A precisão pondera os julgamentos e inclui apertos extras para evitar vantagem ao apertar sem parar.

### Ajuste e limites

- Em **Ajustar sincronia e ritmo**, a compensação entre −250 e +250 ms desloca chegada e julgamento juntos. Valor positivo atrasa a seta em relação ao áudio. A preferência fica no navegador.
- O campo **BPM manual** (60–180) recalcula também a fase. Ajuda quando há ambiguidade de metade/dobro do andamento. Limpar o campo restaura a estimativa automática.
- O gerador estima um andamento global. Música ao vivo, rubato, introduções sem percussão e mudanças de andamento podem produzir mapas menos alinhados. Para a feira, prefira gravações de estúdio com bateria regular e faça uma rodada de revisão com o áudio do estande.
- Detectar graves/agudos não identifica instrumentos nem produz transcrição de uma faixa de Guitar Hero. A análise fornece tempos; o jogo cria uma coreografia simplificada a partir deles. As direções não existem originalmente na música.
- A análise roda fora da thread da interface. Trocar nível reaproveita os resultados; apenas dois áudios decodificados ficam em cache. Não há envio do arquivo importado a um servidor.
- Bluetooth e equipamentos de som introduzem latência variável. Faça a calibração no computador e nas caixas que serão usados na apresentação.

Referências de implementação: [MDN — decodeAudioData](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData), [MDN — getOutputTimestamp](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/getOutputTimestamp).

## MQTT: estrutura pronta para a próxima etapa

A aplicação não conecta ao broker, não carrega Paho via CDN e não depende de internet para receber o teclado. `src/input.js` é a fronteira de entrada comum.

O futuro callback MQTT pode chamar:

```js
window.dancePad.receive('UP'); // pulso único; aceita LEFT, UP, DOWN e RIGHT
window.dancePad.receive({ dir: 'LEFT', pressed: true }); // borda de pressão
window.dancePad.receive({ dir: 'LEFT', pressed: false }); // liberação

// Alternativa por evento:
window.dispatchEvent(new CustomEvent('dancepad:input', {
  detail: { dir: 'RIGHT', action: 'press' }
}));
window.dispatchEvent(new CustomEvent('dancepad:input', {
  detail: { dir: 'RIGHT', action: 'release' }
}));
```

Também aceita strings JSON. Direções inválidas são ignoradas; `retained: true` é rejeitado. Enquanto uma direção segue pressionada pela mesma origem, repeti-la não gera outro acerto. Mensagens de pulso são liberadas imediatamente. Ao pausar/sair, as teclas presas são limpas.

Quando o tapete estiver funcionando:

1. ESP32 aplica debounce no sensor e publica bordas de pressão/liberação. O envio de pulsações legadas também funciona, mas precisa de debounce no dispositivo.
2. O navegador usa MQTT **sobre WebSocket/WSS**, não conexão TCP direta à porta 1883. Broker e tópico serão configurados nessa etapa; não há necessidade de ativá-los para testar agora.
3. O callback converte payload e metadados (inclusive a flag de mensagem retida) para `dancePad.receive`. Recomenda-se tópico específico da estação para evitar comandos de outra demonstração.
4. Medir latência real do conjunto tapete → broker → navegador, verificar duplicatas/reconexão e calibrar com o som do estande. Esta validação depende do hardware e permanece pendente.

## Arquivos

```text
index.html                 Estrutura semântica, seleção, partida e resultado
styles.css                 Tema, responsividade, alvos e animações
src/app.js                 Catálogo interativo, configurações e ciclo das telas
src/catalog.js             Bases, arquivos existentes e sugestões
src/audio.js               Decode, cache, Workers e relógio de reprodução
src/analysis.js            FFT, ataques, BPM, fase e gerador de passos
src/analysis-worker.js     Execução DSP/síntese fora da interface
src/synth.js               Composição das três bases instrumentais
src/game.js                Renderização, partida, pausa e feedback
src/input.js               Teclado, toque e fronteira futura MQTT
src/scoring.js             Janelas temporais, combo e precisão
scripts/serve.mjs          Servidor local sem dependências
tests/                     Testes do DSP, mapas, entrada e pontuação
```

## Verificar

```powershell
npm run check
npm test
```

Os testes exercitam andamentos conhecidos, mapas completos, geração determinística, limites de densidade, silêncio, BPM manual, janelas temporais, pontuação e entrada do futuro adaptador. A revisão visual e de fluxo usa navegador real (desktop e celular); capturas locais de desenvolvimento ficam em `output/playwright/`, ignoradas pelo Git.

Validação desta implementação: 8 testes automatizados aprovados; partida de 60 s com 44 acertos perfeitos via eventos de teclado, incluindo repetições ignoradas; pausa/retomada e retorno por Esc; importação de MP3, exportação de JSON e rejeição de arquivo sem áudio. Interface revisada em 375, 768, 1024 e 1440 px sem rolagem horizontal. A avaliação musical e a latência do tapete físico ainda devem ser conferidas pela equipe no equipamento da feira.
