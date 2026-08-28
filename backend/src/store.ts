import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { config } from "./config";
import type { Resumen } from "./types";

// Igual que el cliente de Bedrock: una sola instancia por contenedor.
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

export async function guardarResumen(registro: Resumen): Promise<void> {
  if (!config.tableName) {
    // En local, sin tabla configurada, no persistimos. Evita que el script de
    // pruebas exija una tabla real solo para ver si el resumen sale bien.
    console.warn("[store] TABLE_NAME vacio: no se persiste el registro.");
    return;
  }

  await doc.send(
    new PutCommand({ TableName: config.tableName, Item: registro }),
  );
}
