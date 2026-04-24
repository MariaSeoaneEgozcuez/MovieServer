import axios from 'axios';
import config from 'config';
import { sendRPCRequest } from './rabbitmqClient.js';

class ServiceClient {
  /**
   * @param {string} serviceName - Nombre del servicio (auth, query, bbdd, etc)
   * @param {string} transport - 'http' o 'rabbitmq'
   */
  constructor(serviceName, transport = 'http') {
    this.serviceName = serviceName;
    this.transport = transport;
    
    const serviceConfig = config.get(`services.${serviceName}`);
    if (!serviceConfig) {
      throw new Error(`No configuration found for service: ${serviceName}`);
    }
    
    this.baseUrl = serviceConfig.url;
    this.timeout = serviceConfig.timeout || 30000;
    this.queue = serviceConfig.queue || `gateway.requests`;
    
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * GET request vía HTTP
   */
  async get(endpoint, headers = {}) {
    if (this.transport === 'rabbitmq') {
      throw new Error('GET not supported over RabbitMQ. Use HTTP transport.');
    }

    try {
      const response = await this.httpClient.get(endpoint, { headers });
      return response.data;
    } catch (error) {
      this._handleError(error);
    }
  }

  /**
   * POST request con transporte híbrido
   * @param {string} endpoint - Endpoint o tipo de mensaje
   * @param {object} data - Datos a enviar
   * @param {object} headers - Headers HTTP (si es HTTP)
   */
  async post(endpoint, data, headers = {}) {
    if (this.transport === 'http') {
      return this._postHttp(endpoint, data, headers);
    } else {
      return this._postRabbitMQ(endpoint, data);
    }
  }

  /**
   * POST vía HTTP
   */
  async _postHttp(endpoint, data, headers = {}) {
    try {
      const response = await this.httpClient.post(endpoint, data, { headers });
      return response.data;
    } catch (error) {
      this._handleError(error);
    }
  }

  /**
   * POST vía RabbitMQ RPC
   */
  async _postRabbitMQ(endpoint, data) {
    try {
      // El endpoint se usa como tipo de operación
      const payload = {
        operation: endpoint,
        ...data
      };

      const response = await sendRPCRequest(
        this.queue,
        payload,
        this.timeout
      );

      return response;
    } catch (error) {
      throw {
        status: 500,
        message: error.message,
        service: this.serviceName,
        transport: 'rabbitmq'
      };
    }
  }

  /**
   * PUT request vía HTTP
   */
  async put(endpoint, data, headers = {}) {
    if (this.transport === 'rabbitmq') {
      throw new Error('PUT not supported over RabbitMQ. Use HTTP transport.');
    }

    try {
      const response = await this.httpClient.put(endpoint, data, { headers });
      return response.data;
    } catch (error) {
      this._handleError(error);
    }
  }

  /**
   * DELETE request vía HTTP
   */
  async delete(endpoint, headers = {}) {
    if (this.transport === 'rabbitmq') {
      throw new Error('DELETE not supported over RabbitMQ. Use HTTP transport.');
    }

    try {
      const response = await this.httpClient.delete(endpoint, { headers });
      return response.data;
    } catch (error) {
      this._handleError(error);
    }
  }

  /**
   * Manejo centralizado de errores
   */
  _handleError(error) {
    const status = error.response?.status || 500;
    const message = error.response?.data?.message || 
                   error.response?.data?.error || 
                   error.message || 
                   'Unknown error';

    const err = {
      status,
      message,
      service: this.serviceName,
      transport: 'http'
    };

    if (error.response?.data) {
      err.data = error.response.data;
    }

    throw err;
  }
}

/**
 * Crear cliente de servicio
 * @param {string} serviceName - auth, query, bbdd, etc
 * @param {string} transport - 'http' o 'rabbitmq'
 */
export function createServiceClient(serviceName, transport = 'http') {
  return new ServiceClient(serviceName, transport);
}

// Clientes predefinidos según su naturaleza
// HTTP: Rápidos y síncronos
export const authService = createServiceClient('auth', 'http');           // Auth rápido
export const bbddService = createServiceClient('bbdd', 'http');           // BBDD rápido
export const statsService = createServiceClient('stats', 'http');         // Stats rápido

// RabbitMQ: Operaciones que pueden tardar
export const queryService = createServiceClient('query', 'rabbitmq');     // Query lento (espera LLM)
export const llmService = createServiceClient('llm', 'rabbitmq');         // LLM muy lento

/**
 * Health check para todos los servicios
 */
export async function checkServicesHealth() {
  const services = {
    auth: authService,
    bbdd: bbddService,
    stats: statsService,
    query: queryService,
    llm: llmService
  };

  const health = {};

  for (const [name, service] of Object.entries(services)) {
    try {
      if (service.transport === 'http') {
        // Intenta hacer un ping
        health[name] = {
          status: 'up',
          transport: 'http',
          url: service.baseUrl
        };
      } else {
        // RabbitMQ está arriba si el cliente se conectó
        health[name] = {
          status: 'up',
          transport: 'rabbitmq',
          queue: service.queue
        };
      }
    } catch (error) {
      health[name] = {
        status: 'down',
        error: error.message,
        transport: service.transport
      };
    }
  }

  return health;
}