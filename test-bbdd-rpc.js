import { sendRPCRequest } from './api-gateway/src/lib/rabbitmqClient.js';

async function main() {
  try {
    const response = await sendRPCRequest('bbdd.requests', {
      operation: 'stats.system',
      payload: {}
    });

    console.log('Respuesta BBDD:', response);
  } catch (error) {
    console.error('Error BBDD RPC:', error.message);
  } finally {
    process.exit(0);
  }
}

main();