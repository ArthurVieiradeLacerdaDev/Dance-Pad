#include <WiFi.h>
#include <PubSubClient.h>

// =================================================================
// 1. CONFIGURAÇÕES DE REDE E PINOS
// =================================================================
const char* WIFI_SSID     = "SEU_WIFI_AQUI";       // Nome do seu Wi-Fi / Roteador / Hotspot
const char* WIFI_PASSWORD = "SUA_SENHA_AQUI";     // Senha do Wi-Fi

// Broker MQTT (HiveMQ Público na porta padrão TCP 1883)
const char* MQTT_BROKER   = "broker.hivemq.com";
const int   MQTT_PORT     = 1883;

// Tópicos oficiais
const char* TOPIC_PASSOS  = "str/ddr/artur/passos";
const char* TOPIC_LEGACY  = "str/ddr/passos";

// Pinagem atualizada:
#define PIN_UP     15  // D15 -> Cima
#define PIN_DOWN   18  // D18 -> Baixo (alterado do D2 para D18)
#define PIN_RIGHT   4  // D4  -> Direita
#define PIN_LEFT    5  // D5  -> Esquerda

// =================================================================
// 2. ESTRUTURAS DO FREERTOS (REGRAS DO PROF. EVILASIO)
// =================================================================
enum DirecaoSeta { SETA_UP = 0, SETA_DOWN = 1, SETA_LEFT = 2, SETA_RIGHT = 3 };

typedef struct {
  DirecaoSeta direcao;
  uint32_t    timestamp;
} EventoPasso_t;

// Fila para isolamento de tarefas (Sem variáveis globais soltas!)
QueueHandle_t filaPassos = NULL;

// Controle de debounce na ISR (120ms para papel alumínio)
volatile uint32_t ultimoClique[4] = {0, 0, 0, 0};

// Nomes para o payload JSON
const char* NOMES_SETAS[] = { "UP", "DOWN", "LEFT", "RIGHT" };

// =================================================================
// 3. INTERRUPÇÕES DE HARDWARE (ISRs) COM DEBOUNCE
// =================================================================
void IRAM_ATTR isrGenerica(DirecaoSeta dir) {
  uint32_t agora = xTaskGetTickCountFromISR() * portTICK_PERIOD_MS;
  if (agora - ultimoClique[dir] > 120) {
    ultimoClique[dir] = agora;
    EventoPasso_t ev = { dir, agora };
    BaseType_t xHigherPriorityTaskWoken = pdFALSE;
    xQueueSendFromISR(filaPassos, &ev, &xHigherPriorityTaskWoken);
    if (xHigherPriorityTaskWoken) {
      portYIELD_FROM_ISR();
    }
  }
}

void IRAM_ATTR isrUp()    { isrGenerica(SETA_UP); }
void IRAM_ATTR isrDown()  { isrGenerica(SETA_DOWN); }
void IRAM_ATTR isrLeft()  { isrGenerica(SETA_LEFT); }
void IRAM_ATTR isrRight() { isrGenerica(SETA_RIGHT); }

// =================================================================
// 4. CLIENTE MQTT E TAREFAS FREERTOS
// =================================================================
WiFiClient espClient;
PubSubClient mqttClient(espClient);

void reconectarMQTT() {
  while (!mqttClient.connected()) {
    String clientId = "ESP32-DancePad-" + String(random(0xffff), HEX);
    Serial.print("Conectando ao HiveMQ...");
    if (mqttClient.connect(clientId.c_str())) {
      Serial.println(" CONECTADO!");
    } else {
      Serial.print(" Falhou, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" Tentando em 1.5s...");
      vTaskDelay(pdMS_TO_TICKS(1500));
    }
  }
}

void TaskMQTT(void* pvParameters) {
  EventoPasso_t evento;
  char payload[64];

  for (;;) {
    // Fuga de polling: Fica bloqueada aqui até chegar uma pisada da ISR (0% CPU)
    if (xQueueReceive(filaPassos, &evento, portMAX_DELAY) == pdTRUE) {
      if (!mqttClient.connected()) {
        reconectarMQTT();
      }
      mqttClient.loop();

      // Monta o JSON oficial aceito pelo jogo Web
      snprintf(payload, sizeof(payload), "{\"seta\":\"%s\",\"ts\":%lu}",
               NOMES_SETAS[evento.direcao], evento.timestamp);

      Serial.print("Pisada detectada! Publicando: ");
      Serial.println(payload);

      // Publica nos dois tópicos para garantir
      mqttClient.publish(TOPIC_PASSOS, payload);
      mqttClient.publish(TOPIC_LEGACY, payload);
    }
  }
}

// =================================================================
// 5. SETUP E INICIALIZAÇÃO
// =================================================================
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n--- Dance Pad ESP32 Iniciando ---");

  // 1. Configura os 4 pinos com Pull-up interno (sem resistores na protoboard!)
  pinMode(PIN_UP, INPUT_PULLUP);
  pinMode(PIN_DOWN, INPUT_PULLUP);
  pinMode(PIN_LEFT, INPUT_PULLUP);
  pinMode(PIN_RIGHT, INPUT_PULLUP);

  // 2. Anexa as interrupções de hardware na borda de descida (quando encosta no GND)
  attachInterrupt(digitalPinToInterrupt(PIN_UP), isrUp, FALLING);
  attachInterrupt(digitalPinToInterrupt(PIN_DOWN), isrDown, FALLING);
  attachInterrupt(digitalPinToInterrupt(PIN_LEFT), isrLeft, FALLING);
  attachInterrupt(digitalPinToInterrupt(PIN_RIGHT), isrRight, FALLING);

  // 3. Cria a Fila do FreeRTOS para até 16 passos pendentes
  filaPassos = xQueueCreate(16, sizeof(EventoPasso_t));

  // 4. Conecta no Wi-Fi
  Serial.print("Conectando ao Wi-Fi: ");
  Serial.println(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }
  Serial.println("\nWi-Fi Conectado! IP: " + WiFi.localIP().toString());

  // 5. Configura Broker MQTT
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);

  // 6. Cria a Tarefa FreeRTOS no Core 1
  xTaskCreatePinnedToCore(
    TaskMQTT,
    "TaskMQTT",
    4096,
    NULL,
    2, // Prioridade da tarefa
    NULL,
    1  // Core 1 do ESP32
  );
  
  Serial.println("Sistema FreeRTOS pronto! Pise nas setas...");
}

void loop() {
  // O loop fica livre graças ao FreeRTOS!
  vTaskDelay(pdMS_TO_TICKS(1000));
}
