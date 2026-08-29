function requerido(nombre: string, porDefecto?: string): string {
  const valor = process.env[nombre] ?? porDefecto;
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}`);
  return valor;
}

export const config = {
  /**
   * ID de Bedrock para el endpoint clasico: lleva fecha y version, y el prefijo
   * `us.` del inference profile cross-region. La forma corta
   * (`anthropic.claude-haiku-4-5`) es la de Mantle y aca da `not_found_error`.
   */
  modelId: requerido("BEDROCK_MODEL_ID", "us.anthropic.claude-haiku-4-5-20251001-v1:0"),
  bedrockRegion: requerido("BEDROCK_REGION", process.env.AWS_REGION ?? "us-east-1"),
  tableName: process.env.TABLE_NAME ?? "",
  /** Cuanto texto del articulo mandamos al modelo. Controla costo y latencia. */
  maxCaracteresArticulo: Number(process.env.MAX_CHARS_ARTICULO ?? 24_000),
};
