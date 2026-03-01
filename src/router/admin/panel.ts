import { Elysia } from "elysia";
import path from "node:path";
import { readFile } from "node:fs/promises";

let pageCache: string | null = null;

async function getAdminPage(): Promise<string> {
    if (pageCache) {
        return pageCache;
    }

    const pagePath = path.resolve(process.cwd(), "src/web/admin.html");
    pageCache = await readFile(pagePath, "utf-8");
    return pageCache;
}

export const adminPanelRouter = new Elysia().get("/admin", async () => {
    const html = await getAdminPage();
    return new Response(html, {
        headers: {
            "content-type": "text/html; charset=utf-8",
        },
    });
});
