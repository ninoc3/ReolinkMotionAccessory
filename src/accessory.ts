import { API, Logging, AccessoryPlugin, AccessoryConfig, Service, Characteristic } from 'homebridge';
import fetch from 'node-fetch';
import mqtt from 'mqtt';

export class ReolinkMotionAccessory implements AccessoryPlugin {
  private readonly log: Logging;
  private readonly name: string;
  private readonly cameraIp: string;
  private readonly username: string;
  private readonly password: string;
  private readonly channel: number;
  private readonly pollInterval: number;
  private readonly mqttBroker: string;
  private readonly mqttTopic: string;
  private readonly mqttUsername?: string;
  private readonly mqttPassword?: string;

  private readonly informationService: Service;
  private readonly motionService: Service;
  private readonly mqttClient: mqtt.MqttClient;
  private motionDetected = false;

  constructor(log: Logging, config: AccessoryConfig, api: API) {
    this.log = log;
    this.name = config.name || 'Reolink Motion';
    this.cameraIp = config.cameraIp;
    this.username = config.username;
    this.password = config.password;
    this.channel = config.channel ?? 0;
    this.pollInterval = config.pollInterval ?? 3000;
    this.mqttBroker = config.mqttBroker;
    this.mqttTopic = config.mqttTopic;
    this.mqttUsername = config.mqttUsername;
    this.mqttPassword = config.mqttPassword;

    this.informationService = new api.hap.Service.AccessoryInformation()
      .setCharacteristic(api.hap.Characteristic.Manufacturer, 'Reolink')
      .setCharacteristic(api.hap.Characteristic.Model, 'Duo 2 WiFi')
      .setCharacteristic(api.hap.Characteristic.SerialNumber, 'RD2W-001');

    this.motionService = new api.hap.Service.MotionSensor(this.name);
    this.motionService.getCharacteristic(api.hap.Characteristic.MotionDetected)
      .onGet(() => this.motionDetected);

    const mqttOptions: mqtt.IClientOptions = {};
    if (this.mqttUsername && this.mqttPassword) {
      mqttOptions.username = this.mqttUsername;
      mqttOptions.password = this.mqttPassword;
    }
    this.mqttClient = mqtt.connect(this.mqttBroker, mqttOptions);
    this.mqttClient.on('connect', () => {
      this.log('[MQTT] Connesso al broker', this.mqttBroker);
    });

    setInterval(() => this.pollMotion(api.hap), this.pollInterval);
  }

  async pollMotion(hap: typeof import('hap-nodejs')): Promise<void> {
    const url = `http://${this.cameraIp}/cgi-bin/api.cgi?user=${this.username}&password=${this.password}`;
    const payload = [
      {
        cmd: 'GetMdState',
        action: 0,
        param: { channel: this.channel }
      }
    ];

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const json = await response.json();
      const state = json[0]?.value?.state === 1;

      if (state !== this.motionDetected) {
        this.motionDetected = state;
        this.motionService.updateCharacteristic(hap.Characteristic.MotionDetected, state);
        const msg = state ? 'ON' : 'OFF';
        this.mqttClient.publish(this.mqttTopic, msg, { retain: true });
        this.log(`[REOLINK] Movimento ${msg} - pubblicato su ${this.mqttTopic}`);
      }
    } catch (err: any) {
      this.log('Errore nella richiesta HTTP alla telecamera:', err.message);
    }
  }

  getServices(): Service[] {
    return [this.informationService, this.motionService];
  }
}
