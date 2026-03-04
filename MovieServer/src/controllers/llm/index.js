// Importamos la función correcta que sí existe en nuestro modelo
import { getMovieRecomendation } from "../models/ollama/index.js";

export async function llmCall(message) {
    // Llamamos a la función que acabamos de importar
    return getMovieRecomendation(message);
}