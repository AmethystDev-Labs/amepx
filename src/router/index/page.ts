import { Elysia } from "elysia";
import path from "node:path";
import { readFile } from "node:fs/promises";

let pageCache: string | null = null;

async function getIndexPage(): Promise<string> {
    if (pageCache) {
        return pageCache;
    }

    const pagePath = path.resolve(process.cwd(), "src/web/index.html");
    pageCache = await readFile(pagePath, "utf-8");
    return pageCache;
}

export const indexRouter = new Elysia().get("/", async () => {
    const html = await getIndexPage();
    return new Response(html, {
        headers: {
            "content-type": "text/html; charset=utf-8",
        },
    });
});
