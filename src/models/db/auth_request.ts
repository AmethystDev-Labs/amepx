import mongoose, { Schema, type Document } from "mongoose";

export type OAuthRequestStatus = "pending" | "approved" | "consumed" | "expired" | "denied";

export interface OAuthAuthorizedUser {
    userId: string;
    nickname?: string;
    card?: string;
    avatar?: string;
}

export interface OAuthMatchedMessage {
    messageId?: string;
    plainText?: string;
    userId?: string;
}

export interface OAuthAuthorizationRequestDocument extends Document {
    requestId: string;
    clientId: string;
    redirectUri: string;
    state?: string;
    nonce?: string;
    scope: string[];
    groupId: string;
    code: string;
    codeExpiresAt: Date;
    status: OAuthRequestStatus;
    approvedAt?: Date;
    consumedAt?: Date;
    user?: OAuthAuthorizedUser;
    matchedMessage?: OAuthMatchedMessage;
    createdAt: Date;
    updatedAt: Date;
}

const AuthorizedUserSchema = new Schema<OAuthAuthorizedUser>(
    {
        userId: { type: String, required: true },
        nickname: { type: String, required: false },
        card: { type: String, required: false },
        avatar: { type: String, required: false },
    },
    { _id: false },
);

const MatchedMessageSchema = new Schema<OAuthMatchedMessage>(
    {
        messageId: { type: String, required: false },
        plainText: { type: String, required: false },
        userId: { type: String, required: false },
    },
    { _id: false },
);

const OAuthAuthorizationRequestSchema = new Schema<OAuthAuthorizationRequestDocument>(
    {
        requestId: {
            type: String,
            required: true,
            unique: true,
            index: true,
            trim: true,
        },
        clientId: {
            type: String,
            required: true,
            index: true,
            trim: true,
        },
        redirectUri: {
            type: String,
            required: true,
            trim: true,
        },
        state: {
            type: String,
            required: false,
            trim: true,
        },
        nonce: {
            type: String,
            required: false,
            trim: true,
        },
        scope: {
            type: [String],
            required: true,
            default: [],
        },
        groupId: {
            type: String,
            required: true,
            index: true,
            trim: true,
        },
        code: {
            type: String,
            required: true,
            unique: true,
            index: true,
            trim: true,
        },
        codeExpiresAt: {
            type: Date,
            required: true,
            index: true,
        },
        status: {
            type: String,
            required: true,
            enum: ["pending", "approved", "consumed", "expired", "denied"],
            default: "pending",
            index: true,
        },
        approvedAt: {
            type: Date,
            required: false,
        },
        consumedAt: {
            type: Date,
            required: false,
        },
        user: {
            type: AuthorizedUserSchema,
            required: false,
        },
        matchedMessage: {
            type: MatchedMessageSchema,
            required: false,
        },
    },
    {
        collection: "oauth_authorization_requests",
        timestamps: true,
    },
);

OAuthAuthorizationRequestSchema.index({ status: 1, codeExpiresAt: 1 });

export const OAuthAuthorizationRequestModel =
    mongoose.models.OAuthAuthorizationRequest ??
    mongoose.model<OAuthAuthorizationRequestDocument>(
        "OAuthAuthorizationRequest",
        OAuthAuthorizationRequestSchema,
    );
