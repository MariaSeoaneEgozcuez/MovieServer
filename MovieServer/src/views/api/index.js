import Fastify from "fastify";
import { llmCall } from '../../controllers/llm/index.js';
import config from "config";
import { connectDB } from '../../models/db.js';

// 1. IMPORTAMOS SWAGGER
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';

export async function startServer() {
    const fastify = Fastify();

    // --- CONFIGURACIÓN DE SWAGGER (INTERFAZ GRÁFICA) ---
    // Registramos la información básica de tu API
    await fastify.register(fastifySwagger, {
        openapi: {
            info: {
                title: 'MovieServer API - Grupo David',
                description: 'Documentación interactiva de nuestra API de recomendación de películas con IA.',
                version: '1.0.0'
            }
        }
    });

    // Configuramos la página web que pintará Swagger
    await fastify.register(fastifySwaggerUi, {
        routePrefix: '/api/docs', // Esta será la URL de tu bonita interfaz
        uiConfig: {
            docExpansion: 'list',
            deepLinking: false
        }
    });


    // --- RUTAS DE TUS COMPAÑEROS ---
    fastify.get('/', function (request, reply) {
        reply.send('Hola');
    });

    fastify.get('/llm', async function (request, reply) {
        let msg = request.query.msg;
        let respuesta = await llmCall(msg);
        reply.send(respuesta);
    });

    // --- TU PARTE: API REST PROPIA ---

    fastify.get('/api/status', async function (request, reply) {
        return { status: 'ok', message: 'El servidor funciona correctamente.' };
    });

    fastify.post('/api/query', async function (request, reply) {
        const mensajeUsuario = request.body?.query;
        if (!mensajeUsuario) return reply.status(400).send({ error: "Falta el campo 'query'" });

        try {
            const respuestaIA = await llmCall(mensajeUsuario);
            return { success: true, data: respuestaIA };
        } catch (error) {
            return reply.status(500).send({ error: "Error en la IA" });
        }
    });

    fastify.get('/api/stats', async function (request, reply) {
        return {
            status: "success",
            stats: { total_queries: 150, usuarios_activos: 25 }
        };
    });

    fastify.post('/api/external', async function (request, reply) {
        const peticionExterna = request.body?.solicitud;
        if (!peticionExterna) return reply.status(400).send({ error: "Falta el campo 'solicitud'" });

        try {
            const respuestaIA = await llmCall(peticionExterna);
            return { origen: "MovieServer", respuesta: respuestaIA };
        } catch (error) {
            return reply.status(500).send({ error: "Fallo en el servicio" });
        }
    });

    // --- ARRANQUE ÚNICO DEL SERVIDOR ---
    try {
        await connectDB();
        
        const port = config.get('server.port');
        await fastify.listen({ port: port, host: '0.0.0.0' });
        console.log(`🚀 Servidor Fastify corriendo en el puerto ${port}`);
    } catch (e) {
        console.error('Error Fastify:', e);
        process.exit(1);
    }
}