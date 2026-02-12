import mongoose, { Schema, type Document } from "mongoose";

export interface OAuthClientDocument extends Document {
    clientId: string;
    clientSecretHash?: string;
    name: string;
    picture?: string;
    description?: string;
    redirectUris: string[];
    scopes: string[];
    groupId?: string;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const OAuthClientSchema = new Schema<OAuthClientDocument>(
    {
        clientId: {
            type: String,
            required: true,
            unique: true,
            index: true,
            trim: true,
        },
        clientSecretHash: {
            type: String,
            required: false,
            trim: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        picture: {
            type: String,
            required: false,
            trim: true,
        },
        description: {
            type: String,
            required: false,
            trim: true,
        },
        redirectUris: {
            type: [String],
            required: true,
            default: [],
        },
        scopes: {
            type: [String],
            required: true,
            default: [],
        },
        groupId: {
            type: String,
            required: false,
            trim: true,
        },
        active: {
            type: Boolean,
            required: true,
            default: true,
            index: true,
        },
    },
    {
        collection: "oauth_clients",
        timestamps: true,
    },
);

export const OAuthClientModel =
    mongoose.models.OAuthClient ??
    mongoose.model<OAuthClientDocument>("OAuthClient", OAuthClientSchema);
