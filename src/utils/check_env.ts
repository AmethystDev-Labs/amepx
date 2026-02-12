import { Ajv } from 'ajv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { Logger, type LoggerType } from "./logger.js";

const logger = new Logger("check_env") as LoggerType;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Env {
  NODE_ENV: 'development' | 'production' | 'test';
  MONGO_URL: string;
  MONGO_DB: string;
  SECRET_KEY: string;
  ADMIN_KEY?: string;
  ONEBOT_HTTP_URL?: string;
  ONEBOT_ACCESS_TOKEN?: string;
  OAUTH_CODE_TTL_SECONDS?: number;
  OAUTH_ACCESS_TOKEN_TTL_SECONDS?: number;
  OAUTH_REFRESH_TOKEN_TTL_SECONDS?: number;
  [key: string]: unknown;
}

export function validateEnv(env: NodeJS.ProcessEnv): Env {
  try {
    const schemaPath = resolve(__dirname, '../../schema.json');
    const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));

    const ajv = new Ajv({
      allErrors: true,
      coerceTypes: true,
      useDefaults: true
    });

    ajv.addFormat('mongo-uri', {
      type: 'string',
      validate: (uri: string) => {
        return uri.startsWith('mongodb://') || uri.startsWith('mongodb+srv://');
      }
    });

    const validate = ajv.compile(schema);
    const data = { ...env };

    if (!validate(data)) {
      const errors = validate.errors?.map(err => {
        const path = err.instancePath ? err.instancePath.substring(1) : 'root';
        return `- ${path}: ${err.message}`;
      }).join('\n');
      
      logger.error(`Environment validation failed:\n${errors}`)
      throw new Error(`Environment validation failed:\n${errors}`);
    }

    logger.info("Environment validation passed")
    return data as Env;
  } catch (error) {
    if ((error as { code: string }).code === 'ENOENT') {
      logger.error(`Schema file not found at: ${resolve(__dirname, 'schema.json')}`)
      throw new Error(`Schema file not found at: ${resolve(__dirname, 'schema.json')}`);
    }
    throw error;
  }
}
