// Importamos la función de recomendación de películas desde el modelo de Ollama
import { getMovieRecomendation } from "../../models/ollama/index.js";

export async function llmCall(message) {
    // Llamamos a la función que acabamos de importar
    return getMovieRecomendation(message);
}