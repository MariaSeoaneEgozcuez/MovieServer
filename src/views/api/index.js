import Fastify from "fastify";
import { llmCall } from '../../controllers/llm/index.js';
import config from "config";
import { connectDB, getDB } from '../../models/db.js';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyCors from '@fastify/cors';
import bcrypt from 'bcrypt';
import fastifyJwt from '@fastify/jwt';
import { register, login } from '../../controllers/authControl.js'
import { authenticateToken } from '../../Middleware/authMiddleware.js';

export async function startServer() {
    const fastify = Fastify();

    // Conectar base de datos primero
    try {
        await connectDB();
    } catch (e) {
        console.error('Error conectando BD:', e);
        process.exit(1);
    }

    // ==========================================
    // 0. HABILITAR CORS (para que el frontend pueda conectarse)
    // ==========================================
    await fastify.register(fastifyCors, {
        origin: true,
        credentials: true
    });

    // ==========================================
    // 1. CONFIGURACIÓN DE SWAGGER Y JWT
    // ==========================================
    await fastify.register(fastifySwagger, {
        openapi: {
            info: {
                title: 'MovieServer API',
                description: 'Documentación interactiva de nuestra API.',
                version: '1.0.0'
            }
        }
    });

    await fastify.register(fastifySwaggerUi, {
        routePrefix: '/api/docs',
        uiConfig: {
            docExpansion: 'list',
            deepLinking: false
        }
    });

    fastify.register(fastifyJwt, {
        secret: config.get('jwt.secret')
    });

    // ==========================================
    // 2. RUTAS DE COMPAÑEROS
    // ==========================================
    fastify.get('/', function (request, reply) {
        reply.send('Hola');
    });

    fastify.get('/llm', {
        schema: {
        summary: 'Prueba de llamada al modelo LLM'
        }},async function (request, reply) {
        let msg = request.query.msg;
        let respuesta = await llmCall(msg);
        reply.send(respuesta);
    });

    // ==========================================
    // API REST PROPIA 
    // ==========================================
    fastify.get('/api/status', {
        schema: {
        summary: 'Verifica el estado del servidor'
        }},async function (request, reply) {
        return { status: 'ok', message: 'El servidor funciona correctamente.' };
    });

    fastify.post('/api/query', {
        schema: {
        summary: 'Recibe una consulta del usuario y devuelve una respuesta generada por la IA'
        }},async function (request, reply) {
        const mensajeUsuario = request.body?.query;
        if (!mensajeUsuario) return reply.status(400).send({ error: "Falta el campo 'query'" });

        try {
            const respuestaIA = await llmCall(mensajeUsuario);
            return { success: true, data: respuestaIA };
        } catch (error) {
            return reply.status(500).send({ error: "Error en la IA" });
        }
    });

    fastify.get('/api/stats',{
        schema: {
        summary: 'Muestra las estadísticas básicas del sistema'
        }
    }, async function (request, reply) {
        return {
            status: "success",
            stats: { total_queries: 150, usuarios_activos: 25 }
        };
    });

    fastify.post('/api/external',{
        schema: {
        summary: 'Realiza una solicitud a un servicio externo'
        }
    }, async function (request, reply) {
        const peticionExterna = request.body?.solicitud;
        if (!peticionExterna) return reply.status(400).send({ error: "Falta el campo 'solicitud'" });

        try {
            const respuestaIA = await llmCall(peticionExterna);
            return { origen: "MovieServer", respuesta: respuestaIA };
        } catch (error) {
            return reply.status(500).send({ error: "Fallo en el servicio externo" });
        }
    });

    fastify.get('/api/readme', {
        schema: {
        summary: 'Muestra una descripción detallada del proyecto y su arquitectura'
        }
    }, async function (request, reply) {
        return {
            project: "MovieServer",
            version: "1.0.0",

            description: "MovieServer es una aplicación monolítica basada en Node.js que integra múltiples servicios externos y proporciona funcionalidades inteligentes mediante un modelo LLM.",

            architecture: {
            type: "Monolito con integración de servicios externos",
            backend: "Node.js + Fastify",
            frontend: "React",
            database: "SQLite",
            authentication: "JWT + bcrypt",
            documentation: "Swagger"
            },

            mainComponents: [
            "Servidor Fastify con API REST",
            "Sistema de autenticación JWT",
            "Base de datos SQLite",
            "Integración con modelo LLM",
            "Documentación Swagger",
            "Frontend React"
            ],

            externalServices: [
            "Servicio LLM mediante API",
            "Servicios externos adicionales (pendientes de integrar si aplica)"
            ],

            apiUsage: {
            publicEndpoints: [
                "GET /api/status",
                "GET /api/readme",
                "GET /api/docs",
                "POST /api/auth/register",
                "POST /api/auth/login"
            ],

            protectedEndpoints: [
                "GET /api/auth/verify",
                "POST /api/auth/logout",
                "POST /api/query",
                "GET /api/stats",
                "POST /api/external"
            ]
            },

            execution: {
            backend: [
                "npm install",
                "npm start"
            ],

            frontend: [
                "cd moviefrontend",
                "npm install",
                "npm start"
            ]
            },

            authors: [
            "Linda Payeras O.",
            "David García S.",
            "Raquel Corporales S.",
            "Jorge García C.",
            "María Seoane E."
            ],

            notes: "Para más detalles técnicos consultar /api/docs"
        };
    });

    fastify.get('/api/readme_html', async function (request, reply) {
    reply.type('text/html; charset=utf-8');
        return `
            <h1>MovieServer API</h1>

            <h2>Descripción</h2>
            <p>
            MovieServer es una aplicación monolítica que integra servicios externos
            y proporciona respuestas inteligentes mediante un modelo LLM.
            </p>

            <h2>Arquitectura</h2>
            <ul>
            <li>Backend: Node.js + Fastify</li>
            <li>Frontend: React</li>
            <li>Base de datos: SQLite</li>
            <li>Autenticación: JWT</li>
            </ul>

            <h2>Documentación</h2>
            <p>Consulta la documentación completa en:</p>
            <a href="/api/docs">/api/docs</a>
        `;
    });

    // ==========================================
    // 4. AUTENTICACIÓN Y JWT (Actividad 3.2)
    // ==========================================
    fastify.post('/api/auth/register',{
        schema: {
        summary: 'Registra un nuevo usuario con email y contraseña'
        }}, register
    );

    fastify.post('/api/auth/login',{
        schema: {
        summary: 'Inicia sesión con email y contraseña, obteniendo un token JWT'
        }},login
    );

    fastify.get('/api/auth/verify', {
        schema:{
        summary: 'Verifica la validez del token JWT y muestra información del usuario'
        },
        preHandler: authenticateToken
    }, async function (request, reply){
        return {
            valid: true,
            user: request.user
        }
    })

    // ==========================================
    // 5. ARRANQUE DEL SERVIDOR
    // ==========================================
    try {
        const port = config.get('server.port');
        await fastify.listen({ port: port, host: '0.0.0.0' });
        console.log(`Servidor Fastify corriendo en el puerto ${port}`);
    } catch (e) {
        console.error('Error Fastify:', e);
        process.exit(1);
    }
}