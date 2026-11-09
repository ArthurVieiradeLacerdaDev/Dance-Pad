🕹️ Dance Pad - Web 

Este é o Front-End do nosso projeto de Sistemas Embarcados/Tempo Real. O jogo roda no navegador e se comunica via MQTT para receber os comandos (os "pisões") em tempo real.

Como o tapete físico com o ESP32 (Equipe 1 e 2) ainda está sendo montado, nós usamos o celular para simular os comandos de hardware e testar o jogo.

🚀 Como Rodar o Jogo no PC

Abra a pasta do projeto no VS Code.

Certifique-se de ter a extensão Live Server instalada.

Clique com o botão direito no arquivo index.html e selecione "Open with Live Server".

O navegador vai abrir. Verifique se no canto inferior esquerdo aparece a mensagem em verde: "MQTT: Conectado e Aguardando Tapete".

📱 Como Simular o Tapete pelo Celular

Para jogar e testar a sincronia das setas sem o tapete físico, você precisa de um aplicativo cliente MQTT no celular.

Passo 1: Configurar o App (Recomendamos o MyMQTT no Android)

Abra o aplicativo e vá em Settings (Configurações).

Preencha os dados do servidor público da HiveMQ:

Host: broker.hivemq.com

Port: 1883

SSL: Desmarcado

Username / Password: Deixe em branco.

Volte à tela inicial e clique em Connect. O status deve ficar "Connected".

Passo 2: Enviar os Comandos (Jogar)

Vá para a aba Publish (Publicar) no aplicativo.

Em Topic, coloque exatamente: seminario/str/tapete/movimento

Em Message, você enviará a direção que deseja "pisar". Os comandos aceitos são (sempre em maiúsculo):

UP

DOWN

LEFT

RIGHT

Deixe o jogo rodando no PC. Quando a seta estiver chegando na zona de acerto, aperte o botão de Publish no celular enviando a direção correspondente.

Dica: Se quiser testar pelo próprio PC (em outra aba), acesse o HiveMQ WebSocket Client, conecte no broker público e publique as mensagens no mesmo tópico.

🛠️ O Que Falta Fazer 

A estrutura lógica e visual já está pronta. O que falta agora é inserir as músicas oficiais e criar as coreografias.

1. Adicionar os MP3s

Baixe as músicas que vamos usar na apresentação, coloque-as na mesma pasta do index.html e atualize a propriedade src no array catalogo (linha ~100 do código).
Exemplo: src: "./musica-teste.mp3"

2. Criar os Beatmaps (A Coreografia)

Essa é a parte que exige paciência. Você precisa escutar a música e anotar em qual segundo cada nota deve ser pressionada. No código, o array beatmap de cada música exige o time (tempo) e a dir (direção).

⚠️ ATENÇÃO - A Matemática do Tempo de Viagem (Travel Time):
O time que você coloca no código NÃO é o momento da batida da música, mas sim o momento em que a seta nasce no topo da tela.

Se a seta demora 1.5 segundos para cair do topo até a base na velocidade que você configurou.

E a batida forte da música acontece no segundo 4.0.

Você deve cadastrar no código: { time: 2.5, dir: "UP" } (pois 4.0 - 1.5 = 2.5).

3. Ajuste Fino de Lag (Quando o ESP32 chegar)

Atualmente, a função avaliarAcerto() tem uma variável chamada lagRede = 35. Ela compensa o atraso do 4G/Wi-Fi do celular indo até o servidor da HiveMQ. Quando a Equipe 2 integrar o ESP32 rodando FreeRTOS na mesma rede local que o nosso PC, a latência vai cair. Precisaremos testar e diminuir esse lagRede para deixar o jogo perfeitamente sincronizado com o tapete real.
