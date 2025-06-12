import { API } from 'homebridge';
import { ReolinkMotionAccessory } from './src/accessory';

export = (api: API) => {
  api.registerAccessory('HomebridgeReolinkMotion', ReolinkMotionAccessory);
};
