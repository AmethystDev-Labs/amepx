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

interface OneBotGetMsgData {
    message_id?: number | string;
    message_seq?: number | string;
    messageSeq?: number | string;
    seq?: number | string;
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
    private readonly historyFlagMessage: string;

    constructor() {
        this.baseUrl = process.env.ONEBOT_HTTP_URL ?? "";
        this.accessToken = process.env.ONEBOT_ACCESS_TOKEN ?? "";
        this.historyCount = getPositiveIntEnv("ONEBOT_GROUP_HISTORY_COUNT", 1300);
        this.historyFlagMessage = (process.env.ONEBOT_HISTORY_FLAG_MESSAGE ?? "Amepx!").trim() || "Amepx!";
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

    private parseMessageId(data: unknown): string | number | null {
        if (data === null || data === undefined) {
            return null;
        }

        if (typeof data === "number" || typeof data === "string") {
            return data;
        }

        if (typeof data === "object" && data !== null && "message_id" in data) {
            const messageId = (data as { message_id?: unknown }).message_id;
            if (typeof messageId === "number" || typeof messageId === "string") {
                return messageId;
            }
        }

        return null;
    }

    private parseMessageSeqCandidates(data: unknown): Array<string | number> {
        if (!data || typeof data !== "object") {
            return [];
        }

        const seqFields = ["message_seq", "messageSeq", "seq", "message_id", "id"] as const;
        const candidates: Array<string | number> = [];
        for (const field of seqFields) {
            const value = (data as Record<string, unknown>)[field];
            if (typeof value === "number" || typeof value === "string") {
                candidates.push(value);
            }
        }
        return candidates;
    }

    private async sendGroupHistoryFlag(groupId: string): Promise<string | number | null> {
        const payload = await this.request<unknown>("send_group_msg", {
            group_id: toOneBotId(groupId),
            message: this.historyFlagMessage,
        });

        return this.parseMessageId(payload);
    }

    private async getMsg(messageId: string | number): Promise<OneBotGetMsgData | null> {
        try {
            const data = await this.request<unknown>("get_msg", {
                message_id: toOneBotId(messageId),
            });
            return data && typeof data === "object" ? (data as OneBotGetMsgData) : null;
        } catch (error) {
            logger.warn(`get_msg failed for message_id=${String(messageId)}: ${String(error)}`);
            return null;
        }
    }

    private dedupeIdCandidates(values: Array<string | number>): Array<string | number> {
        const seen = new Set<string>();
        const out: Array<string | number> = [];
        for (const value of values) {
            const key = String(value);
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            out.push(value);
        }
        return out;
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

    async getGroupMessageHistory(groupId: string, messageSeq?: number): Promise<OneBotMessage[]> {
        const group_id = toOneBotId(groupId);

        if (typeof messageSeq === "number") {
            const data = await this.request<unknown>("get_group_msg_history", {
                group_id,
                message_seq: messageSeq,
                count: this.historyCount,
                reverse_order: true,
            });
            return this.normalizeGroupHistoryData(data);
        }

        let flagMessageId: string | number | null = null;
        try {
            flagMessageId = await this.sendGroupHistoryFlag(groupId);
        } catch (error) {
            logger.warn(`send_group_msg flag failed: ${String(error)}`);
        }

        const attempts: Array<Record<string, unknown>> = [];
        if (flagMessageId !== null) {
            const candidates: Array<string | number> = [flagMessageId];
            const msgData = await this.getMsg(flagMessageId);
            if (msgData) {
                candidates.push(...this.parseMessageSeqCandidates(msgData));
            }

            for (const seq of this.dedupeIdCandidates(candidates)) {
                attempts.push({
                    group_id,
                    message_seq: toOneBotId(seq),
                    count: this.historyCount,
                    reverse_order: true,
                });
            }
        }

        // Fallback for implementations that support no message_seq.
        attempts.push({
            group_id,
            count: this.historyCount,
            reverse_order: true,
        });
        attempts.push({ group_id });

        let lastError: Error | null = null;
        for (const params of attempts) {
            try {
                const data = await this.request<unknown>("get_group_msg_history", params);
                return this.normalizeGroupHistoryData(data);
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                logger.warn(
                    `get_group_msg_history failed with params=${JSON.stringify(params)}: ${lastError.message}`,
                );
            }
        }

        throw (
            lastError ??
            new Error("get_group_msg_history failed after all attempts")
        );
    }

    async getGroupMemberInfo(groupId: string, userId: string): Promise<OneBotGroupMemberInfo | null> {
        const data = await this.request<unknown>("get_group_member_info", {
            group_id: toOneBotId(groupId),
            user_id: toOneBotId(userId),
            no_cache: false,
        });

        return data && typeof data === "object" ? (data as OneBotGroupMemberInfo) : null;
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
