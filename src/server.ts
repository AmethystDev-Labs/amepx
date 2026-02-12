import express from "express";
import path from "node:path";
import { Elysia } from "elysia";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { Logger, type LoggerType } from "./utils/logger.js";
import "./utils/env.js";

const logger = new Logger("server") as LoggerType;

export function init(app: express.Express, elysia: Elysia, serve: boolean = true) {

    const HOP_BY_HOP_HEADERS = new Set([
        'connection',
        'keep-alive',
        'proxy-authenticate',
        'proxy-authorization',
        'te',
        'trailers',
        'transfer-encoding',
        'upgrade',
        'host'
    ]);

    function streamToBuffer(stream: any): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
            stream.on('end', () => resolve(Buffer.concat(chunks)));
            stream.on('error', (err: Error) => reject(err));
        });
    }

    function sanitizeHeadersFromRaw(rawHeaders: string[], body?: Buffer): Headers {
        const headers = new Headers();
        for (let i = 0; i < rawHeaders.length; i += 2) {
            const rawName = rawHeaders[i];
            const value = rawHeaders[i + 1];
            if (!rawName || typeof value !== "string") continue;
            const name = rawName.toLowerCase();
            if (HOP_BY_HOP_HEADERS.has(name)) continue;
            headers.append(rawName, value);
        }
        if (body && body.length > 0) {
            headers.set("content-length", String(body.length));
        }
        return headers;
    }

    function headersFromFetchHeaders(h: Headers): Record<string, string> {
        const out: Record<string, string> = {};
        for (const [k, v] of h.entries()) {
            const name = k.toLowerCase();
            if (HOP_BY_HOP_HEADERS.has(name)) continue;
            out[name] = v;
        }
        return out;
    }

    function expressToFetchMiddleware() {
        return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
            try {
                const host = req.get('host');
                const protocol = req.protocol || (req.secure ? 'https' : 'http');
                const path = req.originalUrl || req.url || '/';
                const url = `${protocol}://${host || 'localhost'}${path}`;

                // @ts-ignore
                let body: BodyInit | undefined;
                if (!['GET', 'HEAD'].includes(req.method.toUpperCase())) {
                    if (req.body !== undefined && req.body !== null) {
                        if (Buffer.isBuffer(req.body) || typeof req.body === 'string') {
                            body = Buffer.isBuffer(req.body) ? new Uint8Array(req.body) : req.body;
                        } else if (typeof req.body === 'object') {
                            body = JSON.stringify(req.body);
                        }
                    } else {
                        const buffer = await streamToBuffer(req);
                        if (!buffer || buffer.length === 0) body = undefined;
                        if (buffer && buffer.length > 0) {
                            body = new Uint8Array(buffer);
                            (req as any).rawBody = buffer;
                        }
                    }
                }

                const headers = sanitizeHeadersFromRaw(req.rawHeaders as string[], body as Buffer | undefined);
                const rawCookie = req.headers.cookie;
                if (typeof rawCookie === "string" && rawCookie.length > 0) {
                    headers.set("x-elysia-cookie", rawCookie);
                }

                const init: RequestInit = {
                    method: req.method,
                    headers,
                    body
                };

                if (init.body === undefined) delete init.body;

                (req as any).fetchRequest = new Request(url, init);
                next();
            } catch (err) {
                next(err);
            }
        };
    }

    function guessContentType(requestPath: string): string | undefined {
        const ext = path.extname(requestPath).toLowerCase();
        switch (ext) {
            case ".js":
            case ".mjs":
                return "application/javascript";
            case ".css":
                return "text/css";
            case ".html":
                return "text/html";
            case ".json":
            case ".map":
                return "application/json";
            case ".svg":
                return "image/svg+xml";
            case ".png":
                return "image/png";
            case ".jpg":
            case ".jpeg":
                return "image/jpeg";
            case ".gif":
                return "image/gif";
            case ".webp":
                return "image/webp";
            case ".ico":
                return "image/x-icon";
            case ".woff":
                return "font/woff";
            case ".woff2":
                return "font/woff2";
            case ".ttf":
                return "font/ttf";
            case ".otf":
                return "font/otf";
            case ".txt":
                return "text/plain";
            default:
                return undefined;
        }
    }

    async function sendFetchResponseToExpress(
        fetchRes: Response,
        res: express.Response,
        requestPath?: string,
    ) {
        const headersObj = headersFromFetchHeaders(fetchRes.headers);
        const existingType = fetchRes.headers.get("content-type");
        if (requestPath) {
            const guessed = guessContentType(requestPath);
            if (guessed && (!existingType || existingType.startsWith("text/plain"))) {
                headersObj["content-type"] = guessed;
            }
        }
        for (const [k, v] of Object.entries(headersObj)) {
            res.setHeader(k, v);
        }
        res.status(fetchRes.status);
        if (!fetchRes.body) {
            res.end();
            return;
        }
        let nodeStream: NodeJS.ReadableStream | undefined;
        const bodyAny: any = fetchRes.body;
        if (typeof bodyAny.pipe === 'function') {
            nodeStream = bodyAny;
        } else if (typeof (bodyAny as any).getReader === 'function') {
            if (typeof (Readable as any).fromWeb === 'function') {
                nodeStream = (Readable as any).fromWeb(bodyAny);
            } else {
                const reader = bodyAny.getReader();
                nodeStream = Readable.from((async function* () {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        yield Buffer.from(value);
                    }
                })());
            }
        } else {
            const ab = await fetchRes.arrayBuffer();
            res.send(Buffer.from(ab));
            return;
        }
        if (nodeStream) {
            await pipeline(nodeStream, res);
        } else {
            res.end();
        }
    }

    app.use(expressToFetchMiddleware());

    app.use(async (req: express.Request, res: express.Response, next: express.NextFunction) => {
        const fetchReq = (req as any).fetchRequest;
        if (!fetchReq) {
            return next();
        }
        try {
            const response = await elysia.fetch(fetchReq);
            await sendFetchResponseToExpress(response, res, req.path);
        } catch (error) {
            console.error('Elysia fetch error:', error);
            if (!res.headersSent) {
                res.status(500).send('Internal Server Error');
            } else {
                try { res.end(); } catch (e) { }
            }
        }
    });

    if (serve) {
        app.listen(process.env.PORT || 3000, () => {
            logger.info(`Server started on port ${process.env.PORT || 3000}`);
        });
    }
}
