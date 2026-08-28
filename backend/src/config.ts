function requerido(nombre: string, porDefecto?: string): string {
  const valor = process.env[nombre] ?? porDefecto;
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}`);
  return valor;
}

export const config = {
  /** ID de Bedrock: lleva prefijo `anthropic.` (un ID first-party pelado da 400). */
  modelId: requerido("BEDROCK_MODEL_ID", "anthropic.claude-haiku-4-5"),
  bedrockRegion: requerido("BEDROCK_REGION", process.env.AWS_REGION ?? "us-east-1"),
  tableName: process.env.TABLE_NAME ?? "",
  /** Cuanto texto del articulo mandamos al modelo. Controla costo y latencia. */
  maxCaracteresArticulo: Number(process.env.MAX_CHARS_ARTICULO ?? 24_000),
};
