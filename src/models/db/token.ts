import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface OAuthTokenDocument extends Document {
    clientId: string;
    userId: string;
    scope: string[];
    groupId?: string;
    requestId?: string;
    nickname?: string;
    card?: string;
    avatar?: string;
    accessTokenHash: string;
    refreshTokenHash: string;
    accessExpiresAt: Date;
    refreshExpiresAt: Date;
    revokedAt?: Date;
    rotatedFrom?: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const OAuthTokenSchema = new Schema<OAuthTokenDocument>(
    {
        clientId: {
            type: String,
            required: true,
            index: true,
            trim: true,
        },
        userId: {
            type: String,
            required: true,
            index: true,
            trim: true,
        },
        scope: {
            type: [String],
            required: true,
            default: [],
        },
        groupId: {
            type: String,
            required: false,
            trim: true,
        },
        requestId: {
            type: String,
            required: false,
            trim: true,
        },
        nickname: {
            type: String,
            required: false,
            trim: true,
        },
        card: {
            type: String,
            required: false,
            trim: true,
        },
        avatar: {
            type: String,
            required: false,
            trim: true,
        },
        accessTokenHash: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        refreshTokenHash: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        accessExpiresAt: {
            type: Date,
            required: true,
            index: true,
        },
        refreshExpiresAt: {
            type: Date,
            required: true,
            index: true,
        },
        revokedAt: {
            type: Date,
            required: false,
            index: true,
        },
        rotatedFrom: {
            type: Schema.Types.ObjectId,
            required: false,
            ref: "OAuthToken",
        },
    },
    {
        collection: "oauth_tokens",
        timestamps: true,
    },
);

OAuthTokenSchema.index({ clientId: 1, userId: 1, revokedAt: 1 });

export const OAuthTokenModel =
    mongoose.models.OAuthToken ??
    mongoose.model<OAuthTokenDocument>("OAuthToken", OAuthTokenSchema);
