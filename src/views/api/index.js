import Fastify from "fastify";
import { llmCall } from '../../controllers/llm/index.js';
import config from "config";
import { connectDB } from '../../models/db.js';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyCors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import { register, login, logout } from '../../controllers/authControl.js'
import { authenticateToken } from '../../middleware/authMiddleware.js';
import { getSystemStats } from '../../models/user.js';

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
                description: 'API REST para recomendaciones de películas, autenticación y gestión de usuarios. Incluye integración con Telegram y LLM.',
                version: '1.0.0',
                contact: {
                    name: 'MovieServer Team',
                    url: 'https://github.com/MariaSeoaneEgozcuez/MovieServer',
                    email: 'soporte@movieserver.com'
                }
            },
            servers: [
                { url: 'http://localhost:3000', description: 'Servidor local' }
            ],
            components: {
                securitySchemes: {
                    bearerAuth: {
                        type: 'http',
                        scheme: 'bearer',
                        bearerFormat: 'JWT',
                        description: 'Token JWT para autenticación. Inclúyelo como: Bearer <token>'
                    }
                }
            }
        },
        exposeRoute: true,
        swagger: {
            tags: [
                { name: 'Auth', description: 'Registro, login y autenticación de usuarios' },
                { name: 'Recomendaciones', description: 'Obtención de recomendaciones de películas' },
                { name: 'Sistema', description: 'Estado y estadísticas del servidor' },
                { name: 'Telegram', description: 'Integración y prueba de API para Telegram' }
            ]
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

    fastify.setErrorHandler((error, request, reply) => {
        console.error('Unhandled error:', error);
        const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
        const message = statusCode === 500 ? 'Error interno del servidor' : error.message;
        reply.code(statusCode).send({ error: message });
    });

    // ==========================================
    // 2. RUTAS DE TUS COMPAÑEROS
    // ==========================================
    fastify.get('/', function (request, reply) {
        reply.send('Hola');
    });

    fastify.get('/llm', async function (request, reply) {
        let msg = request.query.msg;
        let respuesta = await llmCall(msg);
        reply.send(respuesta);
    });
    
    // REVISAR SI SE HACE ASI PARA TELEGRAM
    fastify.get('/api/telegram', {
        schema: {
            tags: ['Telegram'],
            summary: 'Probar API de Telegram',
            description: 'Endpoint de prueba para verificar la integración con Telegram.',
            response: {
                200: {
                    description: 'Respuesta de bienvenida',
                    type: 'object',
                    properties: {
                        status: { type: 'string' },
                        message: { type: 'string' }
                    },
                    example: { status: 'success', message: '¡Bienvenido a la API de Telegram!' }
                }
            }
        }
    }, async function (request, reply) {
        return { status: "success", message: "¡Bienvenido a la API de Telegram!" };
    });

    // ==========================================
    // 3. TU PARTE: API REST PROPIA (Actividad 3.4)
    // ==========================================
    fastify.get('/api/status', {
        schema: {
            tags: ['Sistema'],
            summary: 'Estado del servidor',
            description: 'Devuelve el estado actual del servidor.',
            response: {
                200: {
                    description: 'Servidor funcionando',
                    type: 'object',
                    properties: {
                        status: { type: 'string' },
                        message: { type: 'string' }
                    },
                    example: { status: 'ok', message: 'El servidor funciona correctamente.' }
                }
            }
        }
    }, async function (request, reply) {
        return { status: 'ok', message: 'El servidor funciona correctamente.' };
    });

    fastify.post('/api/query', {
        schema: {
            tags: ['Recomendaciones'],
            summary: 'Obtener recomendaciones de películas',
            description: 'Devuelve recomendaciones personalizadas de películas usando IA. Requiere autenticación JWT.',
            security: [{ bearerAuth: [] }],
            body: {
                type: 'object',
                required: ['query'],
                properties: {
                    query: {
                        type: 'string',
                        minLength: 1,
                        description: 'Consulta o preferencias del usuario para la recomendación.'
                    }
                }
            },
            response: {
                200: {
                    description: 'Respuesta con recomendaciones',
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        data: {
                            type: 'string',
                            description: 'Respuesta JSON del modelo IA con recomendaciones.'
                        }
                    }
                },
                401: {
                    description: 'No autorizado',
                    type: 'object',
                    properties: { message: { type: 'string' } }
                }
            }
        },
        preHandler: authenticateToken
    }, async function (request, reply) {
        try {
            const respuestaIA = await llmCall(request.body.query);
            return { success: true, data: respuestaIA };
        } catch (error) {
            console.error('Error en /api/query:', error);
            return reply.code(500).send({ error: "Error en la IA" });
        }
    });

    fastify.get('/api/stats', {
        schema: {
            tags: ['Sistema'],
            summary: 'Estadísticas del sistema',
            description: 'Devuelve estadísticas básicas del sistema, como número de usuarios y tokens revocados.',
            response: {
                200: {
                    description: 'Estadísticas del sistema',
                    type: 'object',
                    properties: {
                        status: { type: 'string' },
                        stats: {
                            type: 'object',
                            properties: {
                                total_users: { type: 'integer' },
                                revoked_tokens: { type: 'integer' }
                            }
                        }
                    },
                    example: {
                        status: 'success',
                        stats: { total_users: 10, revoked_tokens: 2 }
                    }
                }
            }
        }
    }, async function (request, reply) {
        try {
            const stats = await getSystemStats();
            return {
                status: "success",
                stats
            };
        } catch (error) {
            console.error('Error en /api/stats:', error);
            return reply.code(500).send({ error: 'No se pudieron obtener las estadísticas del sistema' });
        }
    });

    fastify.post('/api/external', {
        schema: {
            tags: ['Recomendaciones'],
            summary: 'Consulta externa a la IA',
            description: 'Permite enviar una solicitud arbitraria al modelo IA. Uso avanzado.',
            body: {
                type: 'object',
                required: ['solicitud'],
                properties: {
                    solicitud: { type: 'string', minLength: 1, description: 'Texto de la solicitud para la IA.' }
                }
            },
            response: {
                200: {
                    description: 'Respuesta de la IA',
                    type: 'object',
                    properties: {
                        origen: { type: 'string' },
                        respuesta: { type: 'string' }
                    }
                }
            }
        }
    }, async function (request, reply) {
        try {
            const respuestaIA = await llmCall(request.body.solicitud);
            return { origen: "MovieServer", respuesta: respuestaIA };
        } catch (error) {
            console.error('Error en /api/external:', error);
            return reply.code(500).send({ error: "Fallo en el servicio externo" });
        }
    });

    // ==========================================
    // 4. AUTENTICACIÓN Y JWT (Actividad 3.2)
    // ==========================================
    fastify.post('/api/auth/register', {
        schema: {
            tags: ['Auth'],
            summary: 'Registrar un nuevo usuario',
            description: 'Crea un nuevo usuario en el sistema.',
            body: {
                type: 'object',
                required: ['username', 'email', 'password'],
                properties: {
                    username: { type: 'string', minLength: 3, description: 'Nombre de usuario único.' },
                    email: { type: 'string', format: 'email', description: 'Correo electrónico válido.' },
                    password: { type: 'string', minLength: 6, description: 'Contraseña segura.' }
                }
            },
            response: {
                201: {
                    description: 'Usuario creado exitosamente',
                    type: 'object',
                    properties: { message: { type: 'string' } }
                },
                400: {
                    description: 'Error de validación',
                    type: 'object',
                    properties: { message: { type: 'string' } }
                }
            }
        }
    }, register);
    fastify.post('/api/auth/login', {
        schema: {
            tags: ['Auth'],
            summary: 'Iniciar sesión',
            description: 'Permite a un usuario autenticarse y obtener un token JWT.',
            body: {
                type: 'object',
                required: ['username', 'password'],
                properties: {
                    username: { type: 'string', minLength: 3, description: 'Nombre de usuario.' },
                    password: { type: 'string', minLength: 6, description: 'Contraseña.' }
                }
            },
            response: {
                200: {
                    description: 'Login exitoso',
                    type: 'object',
                    properties: {
                        token: { type: 'string', description: 'Token JWT' },
                        user: {
                            type: 'object',
                            properties: {
                                id: { type: 'integer' },
                                username: { type: 'string' },
                                email: { type: 'string' }
                            }
                        }
                    }
                },
                400: {
                    description: 'Credenciales inválidas',
                    type: 'object',
                    properties: { message: { type: 'string' } }
                }
            }
        }
    }, login);
    fastify.get('/api/auth/verify', {
        schema: {
            tags: ['Auth'],
            summary: 'Verificar token JWT',
            description: 'Verifica si el token JWT es válido y devuelve los datos del usuario.',
            security: [{ bearerAuth: [] }],
            response: {
                200: {
                    description: 'Token válido',
                    type: 'object',
                    properties: {
                        valid: { type: 'boolean' },
                        user: {
                            type: 'object',
                            properties: {
                                id: { type: 'integer' },
                                username: { type: 'string' },
                                email: { type: 'string' }
                            }
                        }
                    },
                    example: {
                        valid: true,
                        user: { id: 1, username: 'usuario123', email: 'usuario@email.com' }
                    }
                },
                401: {
                    description: 'Token inválido',
                    type: 'object',
                    properties: { message: { type: 'string' } },
                    example: { message: 'Token inválido' }
                }
            }
        },
        preHandler: authenticateToken
    }, async function (request, reply) {
        return {
            valid: true,
            user: request.user
        };
    });

    fastify.post('/api/auth/logout', {
        schema: {
            tags: ['Auth'],
            summary: 'Cerrar sesión',
            description: 'Revoca el token JWT y cierra la sesión del usuario.',
            security: [{ bearerAuth: [] }],
            response: {
                200: {
                    description: 'Sesión cerrada',
                    type: 'object',
                    properties: { message: { type: 'string' } },
                    example: { message: 'Sesión cerrada' }
                },
                500: {
                    description: 'Error al cerrar sesión',
                    type: 'object',
                    properties: { message: { type: 'string' } },
                    example: { message: 'No se pudo cerrar la sesión correctamente' }
                }
            }
        },
        preHandler: authenticateToken
    }, logout);

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