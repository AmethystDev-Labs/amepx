import mongoose from "mongoose";
import "../../utils/env.js";

let connectPromise: Promise<typeof mongoose> | null = null;

export async function ensureMongoConnected(): Promise<typeof mongoose> {
    if (mongoose.connection.readyState === 1) {
        return mongoose;
    }

    if (!connectPromise) {
        const mongoUrl = process.env.MONGO_URL;
        const dbName = process.env.MONGO_DB;

        if (!mongoUrl || !dbName) {
            throw new Error("MONGO_URL or MONGO_DB is missing");
        }

        connectPromise = mongoose.connect(mongoUrl, {
            dbName,
            autoIndex: true,
        }).catch((error) => {
            connectPromise = null;
            throw error;
        });
    }

    await connectPromise;
    return mongoose;
}
