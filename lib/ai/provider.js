import {createNoopProvider} from './noop-provider.js';
import {createHttpProvider} from './http-provider.js';
export function getModelProvider(config={}){if(!config||config.enabled===false||!config.type)return createNoopProvider();if(config.type==='http')return createHttpProvider(config);return createNoopProvider();}
