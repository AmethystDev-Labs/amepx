import { Logger, type LoggerType } from "../utils/logger.js";

const logger = new Logger("onebot") as LoggerType;

export interface OneBotMessageSegment {
    type?: string;
    data?: Record<string, unknown>;
}

export interface OneBotMessage {
    message_id?: number | string;
    user_id?: number | string;
    message?: string | OneBotMessageSegment[];
    raw_message?: string;
    sender?: {
        user_id?: number | string;
        nickname?: string;
        card?: string;
    };
}

export interface OneBotGroupMemberInfo {
    user_id?: number | string;
    nickname?: string;
    card?: string;
    avatar?: string;
}

interface OneBotApiResponse<T> {
    status?: string;
    retcode?: number;
    wording?: string;
    data?: T;
}

function toOneBotId(id: string | number): string | number {
    if (typeof id === "number") {
        return id;
    }

    const maybeNumber = Number(id);
    if (!Number.isNaN(maybeNumber) && Number.isFinite(maybeNumber)) {
        return maybeNumber;
    }

    return id;
}

function toBaseUrl(url: string): string {
    return url.endsWith("/") ? url : `${url}/`;
}

class OneBotService {
    private readonly baseUrl: string;
    private readonly accessToken: string;

    constructor() {
        this.baseUrl = process.env.ONEBOT_HTTP_URL ?? "";
        this.accessToken = process.env.ONEBOT_ACCESS_TOKEN ?? "";
    }

    private getHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            "content-type": "application/json",
        };

        if (this.accessToken) {
            headers.Authorization = `Bearer ${this.accessToken}`;
        }

        return headers;
    }

    private async request<T>(action: string, params: Record<string, unknown>): Promise<T> {
        if (!this.baseUrl) {
            throw new Error("ONEBOT_HTTP_URL is not configured");
        }

        const url = new URL(action.replace(/^\//, ""), toBaseUrl(this.baseUrl)).toString();
        const response = await fetch(url, {
            method: "POST",
            headers: this.getHeaders(),
            body: JSON.stringify(params),
        });

        if (!response.ok) {
            throw new Error(`OneBot API request failed with status ${response.status}`);
        }

        const payload = (await response.json()) as OneBotApiResponse<T>;
        if (payload.status !== "ok" || payload.retcode !== 0) {
            throw new Error(payload.wording || `OneBot API retcode ${payload.retcode}`);
        }

        return payload.data as T;
    }

    extractPlainText(message: string | OneBotMessageSegment[] | undefined): string {
        if (!message) {
            return "";
        }

        if (typeof message === "string") {
            return message;
        }

        const textSegments: string[] = [];
        for (const segment of message) {
            if (!segment || typeof segment !== "object") {
                continue;
            }

            const dataText = segment.data?.text;
            if (typeof dataText === "string") {
                textSegments.push(dataText);
            }
        }

        return textSegments.join("");
    }

    findLastMessageContainingCode(messages: OneBotMessage[], code: string): OneBotMessage | null {
        const normalizedCode = code.trim();
        if (!normalizedCode) {
            return null;
        }

        for (let idx = messages.length - 1; idx >= 0; idx -= 1) {
            const message = messages[idx];
            const plainText = this.extractPlainText(message.message) || message.raw_message || "";
            if (plainText.lastIndexOf(normalizedCode) !== -1) {
                return message;
            }
        }

        return null;
    }

    async getGroupMessageHistory(groupId: string, messageSeq?: number): Promise<OneBotMessage[]> {
        const params: Record<string, unknown> = {
            group_id: toOneBotId(groupId),
        };

        if (typeof messageSeq === "number") {
            params.message_seq = messageSeq;
        }

        const data = await this.request<{ messages?: OneBotMessage[] } | OneBotMessage[]>(
            "get_group_msg_history",
            params,
        );

        if (Array.isArray(data)) {
            return data;
        }

        if (data && Array.isArray(data.messages)) {
            return data.messages;
        }

        return [];
    }

    async getGroupMemberInfo(groupId: string, userId: string): Promise<OneBotGroupMemberInfo> {
        return this.request<OneBotGroupMemberInfo>("get_group_member_info", {
            group_id: toOneBotId(groupId),
            user_id: toOneBotId(userId),
            no_cache: false,
        });
    }

    async resolveCodeFromGroup(
        groupId: string,
        code: string,
        messageSeq?: number,
    ): Promise<{
        matchedMessage: OneBotMessage | null;
        plainText: string;
        userId: string | null;
        memberInfo: OneBotGroupMemberInfo | null;
    }> {
        const messages = await this.getGroupMessageHistory(groupId, messageSeq);
        const matchedMessage = this.findLastMessageContainingCode(messages, code);
        if (!matchedMessage) {
            return {
                matchedMessage: null,
                plainText: "",
                userId: null,
                memberInfo: null,
            };
        }

        const plainText = this.extractPlainText(matchedMessage.message) || matchedMessage.raw_message || "";
        const senderId = matchedMessage.user_id ?? matchedMessage.sender?.user_id;
        const userId = senderId !== undefined && senderId !== null ? String(senderId) : null;

        if (!userId) {
            logger.warn("Matched code message but missing sender user_id");
            return {
                matchedMessage,
                plainText,
                userId: null,
                memberInfo: null,
            };
        }

        let memberInfo: OneBotGroupMemberInfo | null = null;
        try {
            memberInfo = await this.getGroupMemberInfo(groupId, userId);
        } catch (error) {
            logger.warn(`Failed to query group member info for user ${userId}: ${String(error)}`);
        }

        return {
            matchedMessage,
            plainText,
            userId,
            memberInfo,
        };
    }
}

export const oneBotService = new OneBotService();
