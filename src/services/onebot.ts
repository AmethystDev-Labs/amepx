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
    group_id?: number | string;
    user_id?: number | string;
    nickname?: string;
    card?: string;
    sex?: string;
    age?: number;
    join_time?: number | string;
    last_sent_time?: number | string;
    level?: string;
    qq_level?: number;
    role?: "owner" | "admin" | "member" | string;
    title?: string;
    area?: string;
    unfriendly?: boolean;
    title_expire_time?: number;
    card_changeable?: boolean;
    shut_up_timestamp?: number;
    is_robot?: boolean;
    qage?: number;
    avatar?: string;
}

interface OneBotApiResponse<T> {
    status?: string;
    retcode?: number;
    wording?: string;
    data?: T;
}

function toBaseUrl(url: string): string {
    return url.endsWith("/") ? url : `${url}/`;
}

function getPositiveIntEnv(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) {
        return fallback;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }

    return Math.floor(parsed);
}

class OneBotService {
    private readonly baseUrl: string;
    private readonly accessToken: string;
    private readonly historyCount: number;

    constructor() {
        this.baseUrl = process.env.ONEBOT_HTTP_URL ?? "";
        this.accessToken = process.env.ONEBOT_ACCESS_TOKEN ?? "";
        this.historyCount = getPositiveIntEnv("ONEBOT_GROUP_HISTORY_COUNT", 20);
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

    private normalizeGroupHistoryData(data: unknown): OneBotMessage[] {
        if (Array.isArray(data)) {
            return data as OneBotMessage[];
        }

        if (!data || typeof data !== "object") {
            return [];
        }

        const messages = (data as { messages?: unknown }).messages;
        if (Array.isArray(messages)) {
            return messages as OneBotMessage[];
        }

        return [];
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

    async getGroupMessageHistory(groupId: string): Promise<OneBotMessage[]> {
        const params = {
            group_id: groupId,
            count: this.historyCount,
        } as const;

        try {
            const data = await this.request<unknown>("get_group_msg_history", params);
            return this.normalizeGroupHistoryData(data);
        } catch (error) {
            logger.warn(
                `get_group_msg_history failed with params=${JSON.stringify(params)}: ${String(error)}`,
            );
            throw error;
        }
    }

    async getGroupMemberInfo(groupId: string, userId: string): Promise<OneBotGroupMemberInfo | null> {
        const data = await this.request<unknown>("get_group_member_info", {
            group_id: groupId,
            user_id: userId,
            no_cache: false,
        });

        return data && typeof data === "object" ? (data as OneBotGroupMemberInfo) : null;
    }

    async resolveCodeFromGroup(
        groupId: string,
        code: string,
    ): Promise<{
        matchedMessage: OneBotMessage | null;
        plainText: string;
        userId: string | null;
        memberInfo: OneBotGroupMemberInfo | null;
    }> {
        const messages = await this.getGroupMessageHistory(groupId);
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
