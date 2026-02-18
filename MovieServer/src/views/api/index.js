import Fastify from "fastify"
import { llmCall } from '../../controllers/llm/index.js'
import config from "config"

export async function startServer(){

    const fastify = Fastify()

    fastify.get('/',function (request, reply){
        reply.send('Hola')
    })
    fastify.get('/llm', async function (request, reply){
        let msg = request.query.msg
        let respuesta = await llmCall(msg)
        reply.send(respuesta)
    })
    
    try{
        await fastify.listen({port: config.get('server.port')})
    }catch(e){
        console.error('Error Fastify:',e)
        process.exit(1)
    }

}