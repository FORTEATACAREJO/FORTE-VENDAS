import * as Sentry from '@sentry/react';
import {monitoringOptions} from './monitoring-options.js';
let active=false;
export function initMonitoring(env=import.meta.env){const options=monitoringOptions(env);active=options.enabled;if(active)Sentry.init({...options,integrations:[Sentry.globalHandlersIntegration(),Sentry.dedupeIntegration()]});return active;}
export function reportScreenError(error){if(active)return Sentry.captureException(error);}
export const reactErrorOptions={onUncaughtError(error){reportScreenError(error);console.error('FORTE VENDAS: erro não tratado',error);},onRecoverableError(error){reportScreenError(error);console.error('FORTE VENDAS: erro recuperável',error);}};
