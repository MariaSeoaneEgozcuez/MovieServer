
// Importaciones de librerías y módulos propios
import Fastify from "fastify"; // Framework web para Node.js
import { llmCall } from '../../controllers/llm/index.js'; // Llama al modelo de recomendación LLM
import config from "config"; // Configuración del sistema
import { connectDB } from '../../models/db.js'; // Conexión a la base de datos SQLite
import fastifySwagger from '@fastify/swagger'; // Documentación Swagger/OpenAPI
import fastifySwaggerUi from '@fastify/swagger-ui'; // Interfaz Swagger UI
import fastifyCors from '@fastify/cors'; // Middleware para CORS
import fastifyJwt from '@fastify/jwt'; // Middleware para JWT
import { register, login, logout } from '../../controllers/authControl.js' // Controladores de autenticación
import { authenticateToken } from '../../middleware/authMiddleware.js'; // Middleware para validar JWT
import { getSystemStats } from '../../models/user.js'; // Función para estadísticas
import { sendLlmRequest } from '../../../shared/messaging/llmRpcClient.js';


// Función principal que arranca el servidor y configura todas las rutas y middlewares
export async function startServer() {
    // Creamos la instancia de Fastify
    const fastify = Fastify();


    // Conectamos a la base de datos SQLite antes de arrancar el servidor
    try {
        await connectDB();
    } catch (e) {
        console.error('Error conectando BD:', e);
        process.exit(1);
    }

    // Permitimos peticiones desde cualquier origen
    await fastify.register(fastifyCors, {
        origin: true,
        credentials: true
    });

    // Configuramos Swagger/OpenAPI para documentar todos los endpoints
    await fastify.register(fastifySwagger, {
        openapi: {
            info: {
                title: 'MovieServer API',
                version: '1.0.0'
            },
            components: {
                securitySchemes: {
                    bearerAuth: {
                        type: 'http',
                        scheme: 'bearer',
                        bearerFormat: 'JWT',
                        description: 'Token JWT para autenticación'
                    }
                }
            }
        }
    });


    // Habilitamos la interfaz Swagger UI en /api/docs
    await fastify.register(fastifySwaggerUi, {
        routePrefix: '/api/docs',
        uiConfig: {
            docExpansion: 'list',
            deepLinking: false
        }
    });


    // Registramos el plugin de JWT para proteger rutas
    fastify.register(fastifyJwt, {
        secret: config.get('jwt.secret')
    });


    // Manejador global de errores para devolver mensajes claros
    fastify.setErrorHandler((error, request, reply) => {
        console.error('Unhandled error:', error);
        const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
        const message = statusCode === 500 ? 'Error interno del servidor' : error.message;
        reply.code(statusCode).send({ error: message });
    });

    // Endpoint raíz de prueba
    fastify.get('/', function (request, reply) {
        reply.send('Hola');
    });


    // Endpoint de prueba para llamar directamente al modelo LLM
    fastify.get('/llm', async function (request, reply) {
        let msg = request.query.msg;
        let respuesta = await llmCall(msg);
        reply.send(respuesta);
    });
    
    // Endpoint de prueba para integración con Telegram
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

    // Endpoint para consultar el estado del servidor
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

    // Endpoint principal para pedir recomendaciones de películas (requiere JWT)
    fastify.post('/api/query', {
    preHandler: authenticateToken,
    schema: {
        security: [{ bearerAuth: [] }],
        body: {
            type: 'object',
            required: ['query'],
            properties: {
                query: { type: 'string' }
            }
        },
        response: {
            200: {
                type: 'object',
                properties: {
                    status: { type: 'string' },
                    response: {
                        type: 'object',
                        properties: {
                            messageId: { type: 'string' },
                            timestamp: { type: 'string' },
                            type: { type: 'string' },
                            correlationId: { type: 'string' },
                            payload: {
                                type: 'object',
                                properties: {
                                    result: { type: 'string' }
                                }
                            }
                        }
                    }
                }
            },
            400: {
                type: 'object',
                properties: {
                    error: { type: 'string' }
                }
            },
            500: {
                type: 'object',
                properties: {
                    error: { type: 'string' }
                }
            }
        }
    }
    }, async (request, reply) => {
        const { query } = request.body || {};

        if (!query) {
            return reply.code(400).send({
                error: 'Falta el campo "query"'
            });
        }

        try {
            const llmResponse = await sendLlmRequest({
                query,
                user: request.user
            });

            return reply.code(200).send({
                status: 'success',
                response: llmResponse
            });
        }catch (error) {
            console.error(error);
            return reply.code(500).send({
                error: 'Error procesando la petición con RabbitMQ'
            });
        }
    });

    // Endpoint para obtener estadísticas del sistema
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

    // Endpoint avanzado para enviar solicitudes arbitrarias al modelo IA
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

    // Endpoint para registrar un nuevo usuario
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
    // Endpoint para login de usuario y obtención de token JWT
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
    // Endpoint para verificar la validez de un token JWT
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

    // Endpoint para cerrar sesión y revocar el token JWT
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

    // Arrancamos el servidor en el puerto configurado
    try {
        const port = config.get('server.port');
        await fastify.listen({ port: port, host: '0.0.0.0' });
        console.log(`Servidor Fastify corriendo en el puerto ${port}`);
    } catch (e) {
        console.error('Error Fastify:', e);
        process.exit(1);
    }
}